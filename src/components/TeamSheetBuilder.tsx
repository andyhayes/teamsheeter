import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { FixturePanel } from './FixturePanel';
import { TeamSheet } from './TeamSheet';
import { MinutesPanel } from './MinutesPanel';
import { StatsSheet } from './StatsSheet';
import { ChangeoverList } from './ChangeoverList';
import { matchLength } from '../lib/schedule-utils';
import {
  deriveSheet,
  regenerate,
  sameCell,
  swapCells,
  toggleBenchLock,
  toggleLock,
  togglePeriodLock,
  toggleStartingSub,
  type CellRef,
  type SheetState,
} from '../lib/sheet-state';
import { fixtureTitle, type Fixture } from '../lib/types';
import { scheduleToTsv } from '../lib/export';
import { copyElementImage } from '../lib/copy-image';

interface Props {
  state: SheetState;
  onChange: (update: (s: SheetState) => SheetState) => void;
  /** View only (parents): no setup panel, swaps, locks or regeneration. */
  readOnly?: boolean;
  /** Show team name, opponent, date and venue inputs (off when those live on the fixture). */
  fixtureFields?: boolean;
  /** Extra controls shown before the sheet actions, e.g. a save indicator. */
  toolbar?: ReactNode;
  /** The main action, shown last in place of a primary Print button, e.g. Done. */
  primaryAction?: ReactNode;
}

/**
 * The sheet's title and fixture line. With `formationOnly`, the screen shows just the formation and
 * match length (the page around it already shows the fixture); print and Copy image always get the full header.
 */
export function SheetTitle({
  fixture,
  formation,
  formationOnly = false,
}: {
  fixture: Fixture;
  formation: string;
  formationOnly?: boolean;
}) {
  const { date, venue } = fixture;
  const hide = formationOnly ? 'screen-hidden' : undefined;
  const before = [
    date && new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    venue && (venue === 'home' ? 'Home' : 'Away'),
  ].filter(Boolean);
  return (
    <div className="sheet-title">
      <h1 className={hide}>{fixtureTitle(fixture)}</h1>
      <p className="muted">
        {before.length > 0 && <span className={hide}>{before.join(' · ')} · </span>}
        {formation}
        {` · ${matchLength(fixture.halves)} min`}
      </p>
    </div>
  );
}

/** The team-sheet builder: fixture setup, the generated grid, changeovers, minutes and print. */
export function TeamSheetBuilder({ state, onChange, readOnly = false, fixtureFields = true, toolbar, primaryAction }: Props) {
  const [selected, setSelected] = useState<CellRef | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<'idle' | 'working' | 'copied' | 'downloaded' | 'failed'>('idle');
  const captureRef = useRef<HTMLDivElement>(null);

  const { formation, periods, players, inputKey } = useMemo(() => deriveSheet(state), [state]);
  const schedule = state.scheduleKey === inputKey ? state.schedule : null;

  useEffect(() => {
    if (readOnly) return;
    if (state.scheduleKey !== inputKey || !state.schedule) {
      onChange((s) => regenerate(s));
      setSelected(null);
    }
  }, [inputKey, state.scheduleKey, state.schedule, readOnly, onChange]);

  const updateFixture = (patch: Partial<Fixture>) => onChange((s) => ({ ...s, fixture: { ...s.fixture, ...patch } }));

  const handleCellClick = (cell: CellRef) => {
    if (!selected || selected.period !== cell.period) return setSelected(cell);
    if (sameCell(selected, cell)) return setSelected(null);
    const from = selected;
    onChange((s) => swapCells(s, from, cell));
    setSelected(null);
  };

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

  const lockCount = Object.keys(state.locks).length;
  // Parents see the saved grid even if it no longer matches the current squad.
  const shown = readOnly ? state.schedule : schedule;

  return (
    <div className={`page match ${readOnly ? 'read-only' : ''}`}>
      {!readOnly && (
        <aside className="setup no-print">
          <FixturePanel
            fixture={state.fixture}
            squad={state.squad}
            formation={formation}
            players={players}
            locks={state.locks}
            fixtureFields={fixtureFields}
            onChange={updateFixture}
            onToggleStartingSub={(id) => onChange((s) => toggleStartingSub(s, id))}
          />
        </aside>
      )}

      <section className="sheet-area">
        {/* In print, everything in here is page 1; the minutes go on page 2. */}
        <div className="print-page">
          <div className="capture-area" ref={captureRef}>
            <div className="sheet-header">
              <SheetTitle fixture={state.fixture} formation={formation.name} formationOnly={!fixtureFields} />
              <div className="actions no-print">
                {toolbar}
                {!readOnly && (
                  <>
                    <button onClick={() => onChange((s) => regenerate(s))} title="Re-run the optimiser, keeping locked cells">
                      Regenerate
                    </button>
                    <button onClick={() => onChange((s) => regenerate(s, s.seed + 1))} title="Try a different arrangement with the same balance">
                      Shuffle
                    </button>
                    <button
                      onClick={() => onChange((s) => ({ ...s, locks: {} }))}
                      disabled={lockCount === 0}
                      title="Unlock every cell, leaving players where they are"
                    >
                      Clear locks{lockCount ? ` (${lockCount})` : ''}
                    </button>
                  </>
                )}
                <button onClick={copyImage} disabled={!shown || imageStatus === 'working'} title="Copy the fixture details and team sheet to the clipboard as a picture">
                  {imageLabel}
                </button>
                <button onClick={copyForExcel} disabled={!shown}>
                  {copied ? 'Copied ✓' : 'Copy for Excel'}
                </button>
                <button className={primaryAction ? '' : 'primary'} onClick={() => window.print()}>
                  Print
                </button>
                {primaryAction}
              </div>
            </div>

            {!readOnly && players.length < formation.slots.length && (
              <p className="warning no-print">
                Only {players.length} players selected for {formation.slots.length} places.
              </p>
            )}

            {shown && (
              <TeamSheet
                schedule={shown}
                slots={formation.slots}
                periods={periods}
                players={players}
                locks={state.locks}
                selected={selected}
                readOnly={readOnly}
                onCellClick={handleCellClick}
                onToggleLock={(k, slot) => onChange((s) => toggleLock(s, k, slot))}
                onToggleBenchLock={(k, id) => onChange((s) => toggleBenchLock(s, k, id))}
                onTogglePeriodLock={(k) => onChange((s) => togglePeriodLock(s, k))}
              />
            )}
          </div>

          {shown ? (
            <>
              {!readOnly && (
                <p className="hint no-print">
                  Click two cells in the same column to swap players (including the bench). Swapped cells are locked so{' '}
                  <b>Regenerate</b> keeps them and rebalances everyone else. Lock a bench cell to keep that player off for
                  that period.
                </p>
              )}
              <div className="details">
                <ChangeoverList schedule={shown} periods={periods} slots={formation.slots} players={players} />
                <div className="no-print">
                  <MinutesPanel schedule={shown} periods={periods} players={players} total={matchLength(state.fixture.halves)} />
                </div>
              </div>
              <StatsSheet schedule={shown} players={players} />
            </>
          ) : (
            <p className="muted">{readOnly ? 'The team sheet has not been made yet.' : 'Building schedule…'}</p>
          )}
        </div>
        {shown && (
          <div className="print-only print-page-2">
            <MinutesPanel schedule={shown} periods={periods} players={players} total={matchLength(state.fixture.halves)} />
          </div>
        )}
      </section>
    </div>
  );
}
