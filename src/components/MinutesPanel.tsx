import { formatMinutes, minutesBalance, playerMinutes } from '../lib/schedule-utils';
import type { Period, Player, Schedule } from '../lib/types';

interface Props {
  schedule: Schedule;
  periods: Period[];
  players: Player[];
  total: number;
}

export function MinutesPanel({ schedule, periods, players, total }: Props) {
  const minutes = playerMinutes(schedule, periods, players.map((p) => p.id));
  const balance = minutesBalance(minutes, total);

  return (
    <section className="card minutes">
      <h2>Minutes</h2>
      {balance && (
        <p className="muted">
          Outfield range{' '}
          <b>
            {formatMinutes(balance.min)}–{formatMinutes(balance.max)} min
          </b>{' '}
          · fair share {formatMinutes(Math.round(balance.target * 10) / 10)} min
        </p>
      )}
      <ul className="minutes-list">
        {players.map((p) => {
          const m = minutes.get(p.id)!;
          const fullKeeper = m.gk >= total;
          const diff = balance && !fullKeeper ? m.total - balance.target : 0;
          return (
            <li key={p.id}>
              <span className="who">
                {p.name}
                {m.gk > 0 && <span className="tag">GK {formatMinutes(m.gk)}′</span>}
                {m.started && !fullKeeper && <span className="tag subtle">Starts</span>}
              </span>
              <span className="bar" aria-hidden>
                {m.gk > 0 && <span className="fill gk" style={{ width: `${(m.gk / total) * 100}%` }} />}
                <span className="fill" style={{ width: `${(m.outfield / total) * 100}%` }} />
                {balance && (
                  <span className="target" style={{ left: `${(balance.target / total) * 100}%` }} />
                )}
              </span>
              <span className={`mins ${diff <= -5 ? 'low' : diff >= 5 ? 'high' : ''}`}>
                {formatMinutes(m.total)}′
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
