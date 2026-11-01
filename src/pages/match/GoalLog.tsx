import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorBox } from '../../components/ui';
import type { Match, MatchGoal } from '../../lib/db-types';
import { deleteRows, insertRow } from '../../lib/queries';
import { formatMinutes } from '../../lib/schedule-utils';

export function GoalLog({
  match,
  players,
  goals,
  canEdit,
  onLogged,
}: {
  match: Match;
  players: { id: string; name: string }[];
  goals: MatchGoal[];
  canEdit: boolean;
  /** Called after a goal is added (+1) or removed (−1), e.g. to keep player tallies in step. */
  onLogged?: (goal: Pick<MatchGoal, 'scorer_id' | 'assist_id'>, delta: 1 | -1) => void;
}) {
  const qc = useQueryClient();
  const [side, setSide] = useState<'for' | 'against'>('for');
  const [minute, setMinute] = useState('');
  const [scorer, setScorer] = useState('');
  const [assist, setAssist] = useState('');
  const [error, setError] = useState<unknown>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['goals', match.id] });
  const name = (id: string | null) => players.find((p) => p.id === id)?.name;

  const add = async () => {
    setError(null);
    try {
      const goal = {
        scorer_id: side === 'for' ? scorer || null : null,
        assist_id: side === 'for' ? assist || null : null,
      };
      await insertRow('match_goals', { match_id: match.id, team_id: match.team_id, side, minute: minute === '' ? null : Number(minute), ...goal });
      onLogged?.(goal, 1);
      setMinute('');
      setScorer('');
      setAssist('');
      await refresh();
    } catch (e) {
      setError(e);
    }
  };

  const gf = goals.filter((g) => g.side === 'for').length;
  const ga = goals.length - gf;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Goals</h2>
        <span className="count">
          {gf}–{ga}
          {match.goals_for != null && (gf !== match.goals_for || ga !== match.goals_against) && (
            <span className="warning"> (result says {match.goals_for}–{match.goals_against})</span>
          )}
        </span>
      </div>
      <ul className="goal-list">
        {goals.map((g) => (
          <li key={g.id} className={g.side}>
            <span className="goal-min">{g.minute != null ? `${formatMinutes(g.minute)}′` : '—'}</span>
            <span>
              {g.side === 'for' ? (
                <>
                  <b>{name(g.scorer_id) ?? (g.own_goal ? 'Own goal' : 'Goal')}</b>
                  {g.assist_id && <span className="muted"> (assist {name(g.assist_id)})</span>}
                </>
              ) : (
                <span className="muted">Conceded</span>
              )}
            </span>
            {canEdit && (
              <button className="icon danger" title="Remove" onClick={() =>
                  deleteRows('match_goals', { id: g.id }).then(() => {
                    onLogged?.(g, -1);
                    return refresh();
                  })
                }>
                ×
              </button>
            )}
          </li>
        ))}
        {goals.length === 0 && <li className="muted small">No goals logged.</li>}
      </ul>
      {canEdit && (
        <form
          className="goal-form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="segmented">
            <button type="button" className={side === 'for' ? 'on' : ''} onClick={() => setSide('for')}>
              We scored
            </button>
            <button type="button" className={side === 'against' ? 'on' : ''} onClick={() => setSide('against')}>
              Conceded
            </button>
          </div>
          <input type="number" min={0} max={match.duration_minutes + 30} inputMode="numeric" placeholder="Minute" value={minute} onChange={(e) => setMinute(e.target.value)} />
          {side === 'for' && (
            <>
              <select value={scorer} onChange={(e) => setScorer(e.target.value)} aria-label="Scorer">
                <option value="">Scorer…</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select value={assist} onChange={(e) => setAssist(e.target.value)} aria-label="Assist">
                <option value="">Assist…</option>
                {players.filter((p) => p.id !== scorer).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button className="primary">Add goal</button>
          <ErrorBox error={error} />
        </form>
      )}
    </section>
  );
}
