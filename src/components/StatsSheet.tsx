import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { Player, Schedule } from '../lib/types';

interface Props {
  schedule: Schedule;
  players: Player[];
}

const COLUMNS = ['GK saves', 'Shots', 'On target', 'Assists', 'Goals'];
/** Smallest comfortable tally row (px) before the players are split into two tables. */
const MIN_ROW = 22;
/** Used when the print layout can't be measured (browsers other than Chrome/Edge). */
const SINGLE_COLUMN_MAX = 12;

/**
 * Blank tally chart for recording stats by hand on the day. Print only; it stretches to fill
 * the rest of the page, using a single column of players unless the rows would get too cramped.
 */
export function StatsSheet({ schedule, players }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(players.length > SINGLE_COLUMN_MAX);
  /** Name font size (px) fitted to the measured row height; null until measured. */
  const [nameSize, setNameSize] = useState<number | null>(null);
  useEffect(() => setSplit(players.length > SINGLE_COLUMN_MAX), [players.length]);

  // Chrome lays the page out for print before firing this, and includes DOM changes made here,
  // so we can measure the real space left on the page and pick one or two columns.
  useEffect(() => {
    const mq = matchMedia('print');
    const onChange = (e: MediaQueryListEvent) => {
      const el = containerRef.current;
      if (!e.matches || !el || !players.length) return;
      const header = el.querySelector('thead')?.getBoundingClientRect().height ?? 0;
      const space = el.clientHeight - header;
      const fitsSingle = space / players.length >= MIN_ROW;
      const rowHeight = space / (fitsSingle ? players.length : Math.ceil(players.length / 2));
      flushSync(() => {
        setSplit(!fitsSingle);
        setNameSize(Math.min(20, Math.max(12, Math.round(rowHeight * 0.5))));
      });
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [players.length]);

  // Keepers first (in the order they play in goal), then everyone else alphabetically.
  const keepers = new Set(schedule.map((row) => row[0]).filter(Boolean));
  const keeperOrder = [...keepers];
  const ordered = [
    ...keeperOrder.map((id) => players.find((p) => p.id === id)).filter((p): p is Player => !!p),
    ...players
      .filter((p) => !keepers.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })),
  ];
  const half = Math.ceil(ordered.length / 2);
  const groups = split ? [ordered.slice(0, half), ordered.slice(half)] : [ordered];

  return (
    <section className="card stats-sheet print-only">
      <h2>Match stats</h2>
      <div
        ref={containerRef}
        className={`stats-tables ${split ? 'split' : ''}`}
        style={nameSize ? ({ '--name-size': `${nameSize}px` } as CSSProperties) : undefined}
      >
        {groups.map((group, g) => (
          <table key={g} className="stats-table">
            <thead>
              <tr>
                <th className="stats-name">Player</th>
                {COLUMNS.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.map((p) => (
                <tr key={p.id}>
                  <td className="stats-name">{p.name}</td>
                  {COLUMNS.map((c, i) => (
                    <td key={c} className={i === 0 && !keepers.has(p.id) ? 'na' : ''} />
                  ))}
                </tr>
              ))}
              {/* Pad the shorter table so both halves line up row for row. */}
              {split &&
                Array.from({ length: half - group.length }, (_, i) => (
                  <tr key={`pad-${i}`} className="pad">
                    <td className="stats-name" />
                    {COLUMNS.map((c) => (
                      <td key={c} />
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
