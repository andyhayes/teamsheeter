import { Link } from 'react-router-dom';
import { SortableTable, type Column } from '../../components/SortableTable';
import { Empty, ErrorBox, Loading } from '../../components/ui';
import type { Match, PlayerStatsRow } from '../../lib/db-types';
import { ALL_POSITIONS } from '../../lib/presets';
import { formatMinutes } from '../../lib/schedule-utils';
import { type SquadPlayer } from '../../lib/queries';
import { useTeam } from '../../lib/team-context';
import { GoalLog } from './GoalLog';
import { COUNTERS, totalMinutes, useStatsRows } from './stats-rows';

type Row = PlayerStatsRow & { name: string; total: number };

/**
 * A match's stats at a glance: the hand counts from the team sheet, minutes in each position,
 * the goals and the back lines. Read-only; stats are entered on the Team sheet tab, and minutes,
 * on-pitch goals and back lines follow the team sheet automatically.
 */
export function StatsTab({ match, squad }: { match: Match; squad: SquadPlayer[] }) {
  const { canEdit, path } = useTeam();
  const stats = useStatsRows(match, squad);

  if (stats.isLoading || !stats.view) return <Loading what="stats" />;
  const name = (id: string) => stats.players.find((p) => p.id === id)?.name ?? 'Former player';
  const rows: Row[] = stats.view
    .filter((r) => r.available || totalMinutes(r.minutes) > 0 || COUNTERS.some(([k]) => r[k] > 0))
    .map((r) => ({ ...r, name: name(r.player_id), total: totalMinutes(r.minutes) }));
  const sum = (k: keyof PlayerStatsRow) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const gf = match.goals_for ?? stats.goals.filter((g) => g.side === 'for').length;
  const ga = match.goals_against ?? stats.goals.filter((g) => g.side === 'against').length;
  const playerLink = (r: Row) => <Link to={path(`players/${r.player_id}`)}>{r.name}</Link>;

  const columns: Column<Row>[] = [
    { key: 'name', label: 'Player', value: (r) => r.name, render: playerLink, numeric: false },
    { key: 'total', label: 'Min', value: (r) => r.total, render: (r) => (r.total ? formatMinutes(r.total) : '') },
    ...COUNTERS.map(([k, label]): Column<Row> => ({ key: k, label, value: (r) => r[k], render: (r) => r[k] || '' })),
    {
      key: 'onpitch',
      label: 'On pitch',
      title: 'Goals for – against while on the pitch',
      value: (r) => r.goals_for_on_pitch - r.goals_against_on_pitch,
      render: (r) => (r.total ? `${r.goals_for_on_pitch}–${r.goals_against_on_pitch}` : ''),
    },
  ];

  // Only the positions anyone played, in the usual order (GK, defence, midfield, attack).
  const used = new Set(rows.flatMap((r) => Object.keys(r.minutes).filter((p) => r.minutes[p] > 0)));
  const positions = [...ALL_POSITIONS.filter((p) => used.has(p)), ...[...used].filter((p) => !ALL_POSITIONS.includes(p))];
  const positionColumns: Column<Row>[] = [
    { key: 'name', label: 'Player', value: (r) => r.name, render: playerLink, numeric: false },
    ...positions.map((p): Column<Row> => ({ key: p, label: p, value: (r) => r.minutes[p] ?? 0, render: (r) => (r.minutes[p] ? formatMinutes(r.minutes[p]) : '') })),
    { key: 'total', label: 'Total', value: (r) => r.total, render: (r) => <b>{formatMinutes(r.total)}</b> },
  ];

  // Back lines that played together, across every spell in the match.
  const partnerships = [
    ...stats.spells
      .reduce((m, s) => {
        const ids = [...s.player_ids].sort();
        const key = ids.join();
        const p = m.get(key) ?? { ids, minutes: 0, conceded: 0, spells: 0 };
        m.set(key, { ...p, minutes: p.minutes + Number(s.minutes), conceded: p.conceded + s.goals_conceded, spells: p.spells + 1 });
        return m;
      }, new Map<string, { ids: string[]; minutes: number; conceded: number; spells: number }>())
      .values(),
  ].sort((a, b) => b.minutes - a.minutes);

  return (
    <main className="page">
      <ErrorBox error={stats.error} />
      {match.status !== 'played' && <p className="warning">This match isn't marked as played yet, so its stats don't count towards season totals.</p>}

      <section className="stat-tiles">
        <Tile label="Score" value={`${gf}–${ga}`} />
        <Tile label="Shots" value={sum('shots')} />
        <Tile label="On target" value={sum('shots_on_target')} />
        <Tile label="GK saves" value={sum('saves')} />
        <Tile label="Players" value={rows.filter((r) => r.total > 0).length} />
      </section>

      <p className="muted small">
        {stats.hasSheet
          ? 'Minutes, on-pitch goals and back lines are worked out from the team sheet and goal log.'
          : "This match has no team sheet, so minutes and back lines are as they were saved."}{' '}
        {canEdit && (
          <>
            Enter shots, saves and goals on the <Link to={path(`matches/${match.id}`)}>Team sheet</Link>.
          </>
        )}
      </p>

      {rows.length === 0 ? (
        <Empty>No stats recorded for this match yet.</Empty>
      ) : (
        <div className="stats-layout">
          <div>
            <section className="card">
              <h2>Player stats</h2>
              <SortableTable rows={rows} columns={columns} rowKey={(r) => r.player_id} initialSort="total" />
            </section>
            <section className="card">
              <h2>Minutes by position</h2>
              {positions.length ? (
                <SortableTable rows={rows.filter((r) => r.total > 0)} columns={positionColumns} rowKey={(r) => r.player_id} initialSort="total" />
              ) : (
                <p className="muted small">No minutes recorded.</p>
              )}
            </section>
          </div>
          <div>
            <GoalLog match={match} players={stats.players} goals={stats.goals} canEdit={false} />
            <section className="card">
              <h2>Defensive partnerships</h2>
              {partnerships.length ? (
                <ul className="spell-list partner-list">
                  {partnerships.map((p) => (
                    <li key={p.ids.join()}>
                      <span>{p.ids.map(name).sort().join(' · ')}</span>
                      <span className="muted small nowrap">
                        {formatMinutes(p.minutes)}′ · {p.conceded} conceded
                        {p.minutes > 0 && ` · ${((p.conceded / p.minutes) * 60).toFixed(1)} per 60`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">No back lines recorded.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}
