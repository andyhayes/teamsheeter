import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ChangeoverList } from '../../components/ChangeoverList';
import { MinutesPanel } from '../../components/MinutesPanel';
import { StatsSheet, statsOrder } from '../../components/StatsSheet';
import { TeamSheet } from '../../components/TeamSheet';
import { SheetTitle } from '../../components/TeamSheetBuilder';
import { ErrorBox, SaveIndicator } from '../../components/ui';
import { copyElementImage } from '../../lib/copy-image';
import type { Match, MatchGoal } from '../../lib/db-types';
import { periodAt } from '../../lib/match-stats';
import { deleteRows, insertRow, useMatchGoals, type SquadPlayer } from '../../lib/queries';
import { matchLength } from '../../lib/schedule-utils';
import { deriveSheet, sameCell, swapCells, type CellRef, type SheetState } from '../../lib/sheet-state';
import { COUNTERS, useStatsRows, type Counter } from './stats-rows';
import { GoalLog } from './GoalLog';

interface Props {
  match: Match;
  squad: SquadPlayer[];
  state: SheetState;
  canEdit: boolean;
  /** The Edit button (coaches), plus the team sheet's save indicator. */
  toolbar?: ReactNode;
  /** Coaches: swap players in the grid here without opening the full editor. */
  onChange?: (update: (s: SheetState) => SheetState) => void;
}

const noop = () => {};

/**
 * The team sheet as it prints, with the match stats entered beneath it: tallies per player in place
 * of the printed tally chart, and the goal log, which also fills the goals rows under the grid.
 */
export function SheetView({ match, squad, state, canEdit, toolbar, onChange }: Props) {
  const { formation, periods, players } = useMemo(() => deriveSheet(state), [state]);
  const schedule = state.schedule;
  const goals = useMatchGoals(match.id);
  const stats = useStatsRows(match, squad);
  const captureRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<CellRef | null>(null);

  // Tap a player, then another in the same period, to swap them (as in the editor).
  const handleCellClick = (cell: CellRef) => {
    if (!onChange) return;
    if (!selected || selected.period !== cell.period) return setSelected(cell);
    if (sameCell(selected, cell)) return setSelected(null);
    const from = selected;
    onChange((s) => swapCells(s, from, cell));
    setSelected(null);
  };
  const [imageStatus, setImageStatus] = useState<'idle' | 'working' | 'copied' | 'downloaded' | 'failed'>('idle');

  const goalsByPeriod = useMemo(() => {
    const out = { for: periods.map(() => 0), against: periods.map(() => 0) };
    for (const g of goals.data ?? []) if (g.minute != null) out[g.side][periodAt(periods, g.minute)]++;
    return out;
  }, [goals.data, periods]);

  // − / + in the goals rows: log a goal mid-period (scorer can be added later on the Stats tab), or
  // remove one from that period, preferring the latest without a scorer so named goals are kept.
  // The goal list updates at once and the writes follow in order in the background, so taps stay
  // instant; if a write fails the list is reloaded from the server.
  const qc = useQueryClient();
  const goalsKey = ['goals', match.id];
  const [goalError, setGoalError] = useState<unknown>(null);
  const writes = useRef<{ chain: Promise<unknown>; pending: number }>({ chain: Promise.resolve(), pending: 0 });
  const queueWrite = (write: () => Promise<unknown>) => {
    const w = writes.current;
    w.pending++;
    w.chain = w.chain
      .then(write)
      .catch((e) => {
        setGoalError(e);
        qc.invalidateQueries({ queryKey: goalsKey });
      })
      .finally(() => {
        // Sync with the server once everything queued has landed.
        if (--w.pending === 0) qc.invalidateQueries({ queryKey: goalsKey });
      });
  };
  const stepGoal = (side: 'for' | 'against', k: number, delta: 1 | -1) => {
    setGoalError(null);
    qc.cancelQueries({ queryKey: goalsKey });
    const current = qc.getQueryData<MatchGoal[]>(goalsKey) ?? [];
    if (delta === 1) {
      const p = periods[k];
      const goal: MatchGoal = {
        id: crypto.randomUUID(),
        match_id: match.id,
        team_id: match.team_id,
        side,
        minute: p.start + Math.ceil(p.duration / 2),
        scorer_id: null,
        assist_id: null,
        own_goal: false,
        note: '',
      };
      qc.setQueryData<MatchGoal[]>(goalsKey, [...current, goal].sort((a, b) => (a.minute ?? Infinity) - (b.minute ?? Infinity)));
      const { id, match_id, team_id, minute } = goal;
      queueWrite(() => insertRow('match_goals', { id, match_id, team_id, side, minute }));
    } else {
      const inPeriod = current.filter((g) => g.side === side && g.minute != null && periodAt(periods, g.minute) === k);
      const g = inPeriod.filter((g) => !g.scorer_id && !g.assist_id).at(-1) ?? inPeriod.at(-1);
      if (!g) return;
      qc.setQueryData<MatchGoal[]>(goalsKey, current.filter((x) => x.id !== g.id));
      onGoalLogged(g, -1);
      queueWrite(() => deleteRows('match_goals', { id: g.id }));
    }
  };

  const copyImage = async () => {
    if (!captureRef.current) return;
    // Clear any selected cell so it doesn't appear highlighted in the image.
    flushSync(() => setSelected(null));
    setImageStatus('working');
    const filename = `teamsheet-${[match.date, match.opponent].filter(Boolean).join('-').replace(/[^\w-]+/g, '-') || 'fixture'}.png`;
    try {
      setImageStatus(await copyElementImage(captureRef.current, filename, { padding: 20 }));
    } catch (e) {
      console.error('Copy image failed', e);
      setImageStatus('failed');
    }
    setTimeout(() => setImageStatus('idle'), 2000);
  };

  // Playing in the team sheet counts as available; a logged goal also counts for its scorer and assist.
  const bump = (playerId: string, key: Counter, delta: number) => {
    const row = stats.rows?.find((r) => r.player_id === playerId);
    if (row) stats.update(playerId, { [key]: Math.max(0, row[key] + delta), available: true });
  };
  const onGoalLogged = (g: { scorer_id: string | null; assist_id: string | null }, delta: number) => {
    if (g.scorer_id) bump(g.scorer_id, 'goals', delta);
    if (g.assist_id) bump(g.assist_id, 'assists', delta);
  };

  const total = matchLength(state.fixture.halves);
  return (
    <div className="page sheet-view">
      <div className="print-page">
        <div className="capture-area" ref={captureRef}>
          <div className="sheet-header">
            <SheetTitle fixture={state.fixture} formation={formation.name} formationOnly />
            <div className="actions no-print">
              {toolbar}
              <button onClick={copyImage} disabled={!schedule || imageStatus === 'working'} title="Copy the team sheet to the clipboard as a picture">
                {{ idle: 'Copy image', working: 'Copying…', copied: 'Image copied ✓', downloaded: 'Downloaded ✓', failed: 'Copy failed' }[imageStatus]}
              </button>
              <button onClick={() => { flushSync(() => setSelected(null)); window.print(); }} disabled={!schedule}>
                Print
              </button>
            </div>
          </div>
          <ErrorBox error={goalError} />
          {schedule ? (
            <TeamSheet
              schedule={schedule}
              slots={formation.slots}
              periods={periods}
              players={players}
              locks={state.locks}
              selected={selected}
              readOnly={!onChange}
              swapOnly
              goalsByPeriod={goalsByPeriod}
              onGoalStep={canEdit ? stepGoal : undefined}
              onCellClick={handleCellClick}
              onToggleLock={noop}
              onToggleBenchLock={noop}
              onTogglePeriodLock={noop}
            />
          ) : (
            <p className="muted">
              {canEdit ? 'The squad or setup has changed since this sheet was saved. Press Edit to rebuild it.' : 'The team sheet is being changed.'}
            </p>
          )}
        </div>

        {schedule && (
          <>
            <div className="details">
              <ChangeoverList schedule={schedule} periods={periods} slots={formation.slots} players={players} />
              <div className="no-print">
                <MinutesPanel schedule={schedule} periods={periods} players={players} total={total} />
              </div>
            </div>
            <StatsSheet schedule={schedule} players={players} />
          </>
        )}

        <div className="stats-layout no-print">
          <section className="card">
            <div className="card-head">
              <h2>Match stats</h2>
              {canEdit && <SaveIndicator status={stats.status} error={stats.saveError} />}
            </div>
            <ErrorBox error={stats.error ?? goals.error} />
            {stats.rows && schedule ? (
              <MatchTallies schedule={schedule} players={players} stats={stats} canEdit={canEdit} />
            ) : (
              <p className="muted small">{stats.isLoading ? 'Loading…' : 'Stats can be entered once the team sheet is ready.'}</p>
            )}
            {canEdit && (
              <p className="muted small">
                Use − / + under the grid to count goals in each period, or log a goal with its scorer here, which also adds to
                their tallies. Minutes, on-pitch goals and back lines follow the team sheet automatically (see the Stats tab).
              </p>
            )}
          </section>
          <GoalLog match={match} players={stats.players} goals={goals.data ?? []} canEdit={canEdit} onLogged={onGoalLogged} />
        </div>
      </div>
      {schedule && (
        <div className="print-only print-page-2">
          <MinutesPanel schedule={schedule} periods={periods} players={players} total={total} />
        </div>
      )}
    </div>
  );
}

function MatchTallies({
  schedule,
  players,
  stats,
  canEdit,
}: {
  schedule: NonNullable<SheetState['schedule']>;
  players: { id: string; name: string }[];
  stats: ReturnType<typeof useStatsRows>;
  canEdit: boolean;
}) {
  const { keepers, ordered } = statsOrder(schedule, players);
  const rowOf = new Map((stats.rows ?? []).map((r) => [r.player_id, r]));
  return (
    <div className="table-scroll">
      <table className="stats-entry">
        <thead>
          <tr>
            <th>Player</th>
            {COUNTERS.map(([k, label]) => (
              <th key={k}>{k === 'saves' ? 'GK saves' : label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((p) => {
            const r = rowOf.get(p.id);
            if (!r) return null;
            return (
              <tr key={p.id}>
                <th>{p.name}</th>
                {COUNTERS.map(([k]) =>
                  k === 'saves' && !keepers.has(p.id) && !r.saves ? (
                    <td key={k} className="na" />
                  ) : (
                    <td key={k} className="tally">
                      {canEdit ? (
                        <span className="stepper">
                          <button onClick={() => stats.update(p.id, { [k]: Math.max(0, r[k] - 1), available: true })} disabled={r[k] === 0} aria-label={`${p.name} minus one`}>
                            −
                          </button>
                          <b>{r[k]}</b>
                          <button onClick={() => stats.update(p.id, { [k]: r[k] + 1, available: true })} aria-label={`${p.name} plus one`}>
                            +
                          </button>
                        </span>
                      ) : (
                        r[k] || ''
                      )}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
