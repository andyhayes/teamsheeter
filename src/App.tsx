import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { FixturePanel } from './components/FixturePanel';
import { SquadPanel } from './components/SquadPanel';
import { TeamSheet, type CellRef } from './components/TeamSheet';
import { MinutesPanel } from './components/MinutesPanel';
import { StatsSheet } from './components/StatsSheet';
import { ChangeoverList } from './components/ChangeoverList';
import { FORMATIONS } from './lib/presets';
import { generateSchedule } from './lib/scheduler';
import { flattenPeriods, matchLength } from './lib/schedule-utils';
import { exportState, importState, loadState, saveState, type AppState } from './lib/storage';
import { benchKey, fixtureTitle, lockKey, parseLockKey, type Fixture, type Locks, type Player, type PlayerId } from './lib/types';
import { scheduleToTsv } from './lib/export';
import { copyElementImage } from './lib/copy-image';

function derive(state: AppState) {
  const formation = FORMATIONS.find((f) => f.id === state.fixture.formationId) ?? FORMATIONS[0];
  const periods = flattenPeriods(state.fixture.halves);
  const byId = new Map(state.squad.map((p) => [p.id, p]));
  const players = state.fixture.available
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p);
  const inputKey = JSON.stringify([
    formation.id,
    state.fixture.halves,
    state.fixture.keepers,
    players.map((p) => [p.id, p.positions]),
  ]);
  return { formation, periods, players, inputKey };
}

/** Drop locks that no longer fit the formation, periods or available players. */
function validLocks(locks: Locks, periodCount: number, slotCount: number, players: Player[]): Locks {
  const ids = new Set(players.map((p) => p.id));
  const result: Locks = {};
  for (const [key, id] of Object.entries(locks)) {
    const { period, slot } = parseLockKey(key);
    if (period < periodCount && (slot === null || slot < slotCount) && ids.has(id)) result[key] = id;
  }
  return result;
}

function regenerate(state: AppState, seed = state.seed, locks = state.locks): AppState {
  const { formation, periods, players, inputKey } = derive(state);
  const kept = validLocks(locks, periods.length, formation.slots.length, players);
  const { schedule } = generateSchedule({
    players,
    slots: formation.slots,
    periods,
    keepers: state.fixture.keepers,
    locks: kept,
    seed,
  });
  return { ...state, schedule, scheduleKey: inputKey, locks: kept, seed };
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [tab, setTab] = useState<'match' | 'squad'>('match');
  const [selected, setSelected] = useState<CellRef | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<'idle' | 'working' | 'copied' | 'downloaded' | 'failed'>('idle');
  const captureRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [fileStatus, setFileStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const { formation, periods, players, inputKey } = useMemo(() => derive(state), [state]);
  const schedule = state.scheduleKey === inputKey ? state.schedule : null;

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    if (state.scheduleKey !== inputKey || !state.schedule) {
      setState((s) => regenerate(s));
      setSelected(null);
    }
  }, [inputKey, state.scheduleKey, state.schedule]);

  const updateFixture = (patch: Partial<Fixture>) =>
    setState((s) => ({ ...s, fixture: { ...s.fixture, ...patch } }));
  const updateSquad = (squad: Player[]) =>
    setState((s) => {
      const ids = new Set(squad.map((p) => p.id));
      return {
        ...s,
        squad,
        fixture: {
          ...s.fixture,
          available: s.fixture.available.filter((id) => ids.has(id)),
          keepers: s.fixture.keepers.map((id) => (id && ids.has(id) ? id : null)),
        },
      };
    });

  const handleCellClick = (cell: CellRef) => {
    if (!selected || selected.period !== cell.period) return setSelected(cell);
    if (sameCell(selected, cell)) return setSelected(null);
    setState((s) => swapCells(s, selected, cell));
    setSelected(null);
  };

  const toggleLock = (period: number, slot: number) =>
    setState((s) => {
      const key = lockKey(period, slot);
      const locks = { ...s.locks };
      const id = s.schedule?.[period][slot];
      if (locks[key]) delete locks[key];
      else if (id) locks[key] = id;
      return { ...s, locks };
    });

  const toggleBenchLock = (period: number, id: PlayerId) =>
    setState((s) => {
      const key = benchKey(period, id);
      const locks = { ...s.locks };
      if (locks[key]) delete locks[key];
      else locks[key] = id;
      return { ...s, locks };
    });

  /** Hold a player on the bench for the first period (or release them), then rebalance. */
  const toggleStartingSub = (id: PlayerId) =>
    setState((s) => {
      const key = benchKey(0, id);
      const locks = { ...s.locks };
      if (locks[key]) {
        delete locks[key];
        return regenerate(s, s.seed, locks);
      }
      locks[key] = id;
      for (const [k, v] of Object.entries(locks)) {
        const { period, slot } = parseLockKey(k);
        if (period === 0 && slot !== null && v === id) delete locks[k];
      }
      return regenerate(s, s.seed, locks);
    });

  const togglePeriodLock = (period: number) =>
    setState((s) => {
      const row = s.schedule?.[period] ?? [];
      const bench = derive(s).players.map((p) => p.id).filter((id) => !row.includes(id));
      const locks = { ...s.locks };
      const allLocked =
        row.every((id, slot) => !id || locks[lockKey(period, slot)]) &&
        bench.every((id) => locks[benchKey(period, id)]);
      const set = (key: string, id: PlayerId) => {
        if (allLocked) delete locks[key];
        else locks[key] = id;
      };
      row.forEach((id, slot) => id && set(lockKey(period, slot), id));
      bench.forEach((id) => set(benchKey(period, id), id));
      return { ...s, locks };
    });

  const copyForExcel = async () => {
    if (!schedule) return;
    const byId = new Map(state.squad.map((p) => [p.id, p.name]));
    await navigator.clipboard.writeText(
      scheduleToTsv(schedule, formation.slots, periods, players.map((p) => p.id), byId, state.fixture),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyImage = async () => {
    if (!captureRef.current) return;
    // Clear any selected cell so it doesn't appear highlighted in the image.
    flushSync(() => setSelected(null));
    setImageStatus('working');
    const { opponent, date } = state.fixture;
    const filename = `teamsheet-${[date, opponent].filter(Boolean).join('-').replace(/[^\w-]+/g, '-') || 'fixture'}.png`;
    try {
      setImageStatus(await copyElementImage(captureRef.current, filename, { padding: 20 }));
    } catch (e) {
      console.error('Copy image failed', e);
      setImageStatus('failed');
    }
    setTimeout(() => setImageStatus('idle'), 2000);
  };
  const imageLabel = {
    idle: 'Copy image',
    working: 'Copying…',
    copied: 'Image copied ✓',
    downloaded: 'Downloaded ✓',
    failed: 'Copy failed',
  }[imageStatus];

  const showFileStatus = (ok: boolean, text: string) => {
    setFileStatus({ ok, text });
    setTimeout(() => setFileStatus(null), ok ? 2500 : 6000);
  };

  const exportFile = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const { date, opponent } = state.fixture;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `teamsheeter-${[date, opponent].filter(Boolean).join('-').replace(/[^\w-]+/g, '-') || 'backup'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showFileStatus(true, 'Exported ✓');
  };

  const importFile = async (file: File) => {
    try {
      const next = importState(await file.text());
      setSelected(null);
      setState(next);
      showFileStatus(true, 'Imported ✓');
    } catch (e) {
      showFileStatus(false, `Import failed: ${e instanceof Error ? e.message : 'unreadable file'}`);
    }
  };

  const lockCount = Object.keys(state.locks).length;
  const { date, venue } = state.fixture;
  const title = fixtureTitle(state.fixture);

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ⚽
          </span>
          Teamsheeter
        </div>
        <nav className="tabs">
          <button className={tab === 'match' ? 'active' : ''} onClick={() => setTab('match')}>
            Match day
          </button>
          <button className={tab === 'squad' ? 'active' : ''} onClick={() => setTab('squad')}>
            Squad ({state.squad.length})
          </button>
        </nav>
        <div className="file-actions">
          {fileStatus && <span className={`file-status ${fileStatus.ok ? '' : 'error'}`}>{fileStatus.text}</span>}
          <button onClick={exportFile} title="Save the squad, fixture and team sheet to a file">
            Export
          </button>
          <button onClick={() => importRef.current?.click()} title="Load a previously exported file, replacing the current squad and match day">
            Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) importFile(file);
            }}
          />
        </div>
      </header>

      {tab === 'squad' ? (
        <main className="page">
          <SquadPanel squad={state.squad} onChange={updateSquad} />
        </main>
      ) : (
        <main className="page match">
          <aside className="setup no-print">
            <FixturePanel
              fixture={state.fixture}
              squad={state.squad}
              formation={formation}
              players={players}
              locks={state.locks}
              onChange={updateFixture}
              onToggleStartingSub={toggleStartingSub}
            />
          </aside>

          <section className="sheet-area">
            <div className="capture-area" ref={captureRef}>
            <div className="sheet-header">
              <div>
                <h1>{title}</h1>
                <p className="muted">
                  {[date && new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
                    venue && (venue === 'home' ? 'Home' : 'Away'),
                    formation.name,
                    `${matchLength(state.fixture.halves)} min`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="actions no-print">
                <button onClick={() => setState((s) => regenerate(s))} title="Re-run the optimiser, keeping locked cells">
                  Regenerate
                </button>
                <button onClick={() => setState((s) => regenerate(s, s.seed + 1))} title="Try a different arrangement with the same balance">
                  Shuffle
                </button>
                <button
                  onClick={() => setState((s) => ({ ...s, locks: {} }))}
                  disabled={lockCount === 0}
                  title="Unlock every cell, leaving players where they are"
                >
                  Clear locks{lockCount ? ` (${lockCount})` : ''}
                </button>
                <button onClick={copyImage} disabled={!schedule || imageStatus === 'working'} title="Copy the fixture details and team sheet to the clipboard as a picture">
                  {imageLabel}
                </button>
                <button onClick={copyForExcel}>{copied ? 'Copied ✓' : 'Copy for Excel'}</button>
                <button className="primary" onClick={() => window.print()}>
                  Print
                </button>
              </div>
            </div>

            {players.length < formation.slots.length && (
              <p className="warning no-print">
                Only {players.length} players selected for {formation.slots.length} places.
              </p>
            )}

            {schedule && (
              <TeamSheet
                schedule={schedule}
                slots={formation.slots}
                periods={periods}
                players={players}
                locks={state.locks}
                selected={selected}
                onCellClick={handleCellClick}
                onToggleLock={toggleLock}
                onToggleBenchLock={toggleBenchLock}
                onTogglePeriodLock={togglePeriodLock}
              />
            )}
            </div>

            {schedule ? (
              <>
                <p className="hint no-print">
                  Click two cells in the same column to swap players (including the bench). Swapped cells are locked
                  so <b>Regenerate</b> keeps them and rebalances everyone else. Lock a bench cell to keep that player
                  off for that period.
                </p>
                <div className="details">
                  <ChangeoverList schedule={schedule} periods={periods} slots={formation.slots} players={players} />
                  <MinutesPanel
                    schedule={schedule}
                    periods={periods}
                    players={players}
                    total={matchLength(state.fixture.halves)}
                  />
                </div>
                <StatsSheet schedule={schedule} players={players} />
              </>
            ) : (
              <p className="muted">Building schedule…</p>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

const sameCell = (a: CellRef, b: CellRef) =>
  a.period === b.period && a.slot === b.slot && a.benchPlayer === b.benchPlayer;

function swapCells(state: AppState, a: CellRef, b: CellRef): AppState {
  if (!state.schedule) return state;
  const k = a.period;
  const row = [...state.schedule[k]];
  const locks = { ...state.locks };
  const setSlot = (slot: number, id: string | null) => {
    row[slot] = id;
    if (id) locks[lockKey(k, slot)] = id;
    else delete locks[lockKey(k, slot)];
  };
  if (a.slot !== undefined && b.slot !== undefined) {
    const pa = row[a.slot];
    setSlot(a.slot, row[b.slot]);
    setSlot(b.slot, pa);
  } else if (a.slot !== undefined || b.slot !== undefined) {
    const pitch = (a.slot !== undefined ? a : b).slot!;
    const bench = (a.slot !== undefined ? b : a).benchPlayer!;
    const goingOff = row[pitch];
    delete locks[benchKey(k, bench)];
    if (goingOff) locks[benchKey(k, goingOff)] = goingOff;
    setSlot(pitch, bench);
  } else {
    return state;
  }
  const schedule = state.schedule.map((r, i) => (i === k ? row : r));
  return { ...state, schedule, locks };
}
