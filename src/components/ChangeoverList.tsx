import type { CSSProperties } from 'react';
import { changeovers, formatMinutes } from '../lib/schedule-utils';
import type { Period, Player, Schedule } from '../lib/types';

interface Props {
  schedule: Schedule;
  periods: Period[];
  slots: string[];
  players: Player[];
}

export function ChangeoverList({ schedule, periods, slots, players }: Props) {
  const names = new Map(players.map((p) => [p.id, p.name]));
  const name = (id: string | null) => (id ? names.get(id) ?? '?' : '');
  const list = changeovers(schedule, periods);
  // Group by the half each change leads into, so half-time changes open the second half.
  const halfCount = (periods.at(-1)?.half ?? 0) + 1;
  const groups = Array.from({ length: halfCount }, (_, h) => list.filter((c) => periods[c.period].half === h));
  const groupLabel = (h: number) => (halfCount === 2 ? (h === 0 ? '1st half' : '2nd half') : `Part ${h + 1}`);

  return (
    <section className="card changes">
      <h2>Substitutions</h2>
      {list.length === 0 && <p className="muted">No changes — the starting line-up plays throughout.</p>}
      {list.length > 0 && (
        <div className="change-groups" style={{ '--groups': halfCount } as CSSProperties}>
          {groups.map((group, h) => (
            <div key={h} className="change-group">
              <h3 className="print-only">{groupLabel(h)}</h3>
              {group.length === 0 && <p className="muted small print-only">No changes</p>}
              <ol className="change-list">
                {group.map((c) => (
                  <li key={c.period}>
                    <div className="when">
                      {c.halfTime ? 'HT' : `${formatMinutes(c.time)}′`}
                      {c.halfTime && <span className="muted"> ({formatMinutes(c.time)}′)</span>}
                    </div>
                    <div className="what">
                      {c.subs.map((s) => (
                        <div key={s.on} className="sub">
                          {s.off && <span className="off">▼ {name(s.off)}</span>}
                          <span className="on">▲ {name(s.on)}</span>
                          <span className="pos">{slots[s.slot]}</span>
                        </div>
                      ))}
                      {c.offOnly.map((id) => (
                        <div key={id} className="sub">
                          <span className="off">▼ {name(id)}</span>
                        </div>
                      ))}
                      {c.moves
                        .filter((m) => slots[m.from] !== slots[m.to])
                        .map((m) => (
                          <div key={m.player} className="move">
                            ↔ {name(m.player)} {slots[m.from]} → {slots[m.to]}
                          </div>
                        ))}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
