import { Fragment, useState } from 'react';
import { positionCost } from '../lib/scheduler';
import { formatMinutes } from '../lib/schedule-utils';
import { benchKey, lockKey, type Locks, type Period, type Player, type PlayerId, type Schedule } from '../lib/types';

export interface CellRef {
  period: number;
  slot?: number;
  benchPlayer?: PlayerId;
}

interface Props {
  schedule: Schedule;
  slots: string[];
  periods: Period[];
  players: Player[];
  locks: Locks;
  selected: CellRef | null;
  onCellClick: (cell: CellRef) => void;
  onToggleLock: (period: number, slot: number) => void;
  onToggleBenchLock: (period: number, player: PlayerId) => void;
  onTogglePeriodLock: (period: number) => void;
}

export function TeamSheet({
  schedule,
  slots,
  periods,
  players,
  locks,
  selected,
  onCellClick,
  onToggleLock,
  onToggleBenchLock,
  onTogglePeriodLock,
}: Props) {
  const [hovered, setHovered] = useState<PlayerId | null>(null);
  const byId = new Map(players.map((p) => [p.id, p]));
  const benches = schedule.map((row) => players.filter((p) => !row.includes(p.id)).map((p) => p.id));
  const benchRows = Math.max(0, ...benches.map((b) => b.length));
  const isHalfStart = (k: number) => k > 0 && periods[k].half !== periods[k - 1].half;
  const halfLabel = (periods.at(-1)?.half ?? 0) > 1 ? 'Break' : 'HT';

  /** On the pitch in period k but not in the next period. */
  const goingOff = (k: number, id: PlayerId | null) =>
    !!id && k < schedule.length - 1 && !schedule[k + 1].includes(id);
  const offLabel = (k: number) =>
    isHalfStart(k + 1) ? `Off at ${halfLabel}` : `Off at ${formatMinutes(periods[k + 1].start)}′`;

  const cellClass = (k: number, id: PlayerId | null, isSelected: boolean, extra = '') =>
    [
      'cell',
      extra,
      isSelected && 'selected',
      selected && selected.period === k && !isSelected && 'swap-target',
      id && id === hovered && 'hover-player',
      id && k > 0 && !schedule[k - 1].includes(id) && !extra.startsWith('bench') && 'came-on',
      !extra.startsWith('bench') && goingOff(k, id) && 'going-off',
    ]
      .filter(Boolean)
      .join(' ');

  const playerProps = (id: PlayerId | null) => ({
    onMouseEnter: () => setHovered(id),
    onMouseLeave: () => setHovered(null),
  });

  return (
    <div className="sheet-scroll">
      <table className="sheet">
        <thead>
          <tr>
            <th className="pos-col" />
            {periods.map((p, k) => {
              const row = schedule[k];
              const allLocked =
                row.every((id, s) => !id || locks[lockKey(k, s)]) &&
                benches[k].every((id) => locks[benchKey(k, id)]);
              return (
                <Fragment key={k}>
                  {isHalfStart(k) && <th className="ht-col">{halfLabel}</th>}
                  <th className="period-head">
                    <div className="period-len">{formatMinutes(p.duration)}′</div>
                    <div className="period-time">
                      {formatMinutes(p.start)}–{formatMinutes(p.start + p.duration)}
                    </div>
                    <button
                      className={`lock-btn period-lock no-print ${allLocked ? 'on' : ''}`}
                      onClick={() => onTogglePeriodLock(k)}
                      title={allLocked ? 'Unlock this period' : 'Lock this whole period'}
                    >
                      {allLocked ? <LockIcon /> : <UnlockIcon />}
                    </button>
                  </th>
                </Fragment>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {slots.map((label, s) => (
            <tr key={s} className={s === 0 ? 'gk-row' : ''}>
              <th className="pos-col">{label}</th>
              {periods.map((_, k) => {
                const id = schedule[k][s];
                const player = id ? byId.get(id) : undefined;
                const locked = !!locks[lockKey(k, s)];
                const isSelected = selected?.period === k && selected.slot === s;
                const offPosition = player && positionCost(player, label) >= 5;
                return (
                  <Fragment key={k}>
                    {isHalfStart(k) && <td className="ht-col">{label}</td>}
                    <td
                      className={cellClass(k, id, isSelected, locked ? 'locked' : '')}
                      onClick={() => onCellClick({ period: k, slot: s })}
                      {...playerProps(id)}
                    >
                      <span className="name">
                        {player?.name ?? '—'}
                        {offPosition && (
                          <span className="off-pos" title={`Not a preferred position for ${player.name}`}>
                            •
                          </span>
                        )}
                        {goingOff(k, id) && (
                          <span className="due-off" title={offLabel(k)} aria-label={offLabel(k)}>
                            ▼
                          </span>
                        )}
                      </span>
                      {id && (
                        <button
                          className={`lock-btn no-print ${locked ? 'on' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLock(k, s);
                          }}
                          title={locked ? 'Unlock' : 'Lock this player here'}
                        >
                          {locked ? <LockIcon /> : <UnlockIcon />}
                        </button>
                      )}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
          {Array.from({ length: benchRows }, (_, b) => (
            <tr key={`bench-${b}`} className={b === 0 ? 'bench-row first' : 'bench-row'}>
              <th className="pos-col">{b === 0 ? 'Subs' : ''}</th>
              {periods.map((_, k) => {
                const id = benches[k][b] ?? null;
                const isSelected = !!id && selected?.period === k && selected.benchPlayer === id;
                const locked = !!id && !!locks[benchKey(k, id)];
                return (
                  <Fragment key={k}>
                    {isHalfStart(k) && <td className="ht-col">{b === 0 ? 'Subs' : ''}</td>}
                    {id ? (
                      <td
                        className={cellClass(k, id, isSelected, locked ? 'bench locked' : 'bench')}
                        onClick={() => onCellClick({ period: k, benchPlayer: id })}
                        {...playerProps(id)}
                      >
                        <span className="name">{byId.get(id)?.name}</span>
                        <button
                          className={`lock-btn no-print ${locked ? 'on' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleBenchLock(k, id);
                          }}
                          title={locked ? 'Unlock' : 'Keep this player on the bench for this period'}
                        >
                          {locked ? <LockIcon /> : <UnlockIcon />}
                        </button>
                      </td>
                    ) : (
                      <td className="cell bench empty" />
                    )}
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sheet-key">
        <span><i className="key-on" /> Came on</span>
        <span><i className="key-off" /><span className="due-off">▼</span> Due off at next break</span>
        <span><span className="off-pos">•</span> Not a preferred position</span>
        <span className="no-print"><LockIcon /> Locked</span>
      </div>
    </div>
  );
}

const LockIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
    <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
  </svg>
);

const UnlockIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
    <path d="M4.5 7V5a3.5 3.5 0 0 1 6.8-1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
