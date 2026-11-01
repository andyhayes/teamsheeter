import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionButton, ErrorBox } from '../../components/ui';
import type { Match, MatchSide, MatchStatus } from '../../lib/db-types';
import { deleteRows, updateRow, type SquadPlayer } from '../../lib/queries';
import { useTeam } from '../../lib/team-context';

type Form = Pick<
  Match,
  'date' | 'kickoff' | 'opponent' | 'side' | 'competition' | 'venue' | 'surface' | 'duration_minutes' | 'goals_for' | 'goals_against' | 'captain_id' | 'potm_id' | 'referee' | 'report' | 'status'
>;

const pick = (m: Match): Form => ({
  date: m.date,
  kickoff: m.kickoff,
  opponent: m.opponent,
  side: m.side,
  competition: m.competition,
  venue: m.venue,
  surface: m.surface,
  duration_minutes: m.duration_minutes,
  goals_for: m.goals_for,
  goals_against: m.goals_against,
  captain_id: m.captain_id,
  potm_id: m.potm_id,
  referee: m.referee,
  report: m.report,
  status: m.status,
});

const num = (v: string) => (v === '' ? null : Number(v));

export function ResultTab({ match, squad }: { match: Match; squad: SquadPlayer[] }) {
  const { canEdit, path } = useTeam();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState<Form>(() => pick(match));
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setF(pick(match)), [match]);
  const set = (patch: Partial<Form>) => {
    setSaved(false);
    setF((x) => ({ ...x, ...patch }));
  };
  const dirty = JSON.stringify(f) !== JSON.stringify(pick(match));

  const save = async (patch: Partial<Form> = {}) => {
    setError(null);
    try {
      const next = { ...f, ...patch };
      await updateRow('matches', { id: match.id }, { ...next, kickoff: next.kickoff || null });
      await qc.invalidateQueries({ queryKey: ['match', match.id] });
      await qc.invalidateQueries({ queryKey: ['matches', match.season_id] });
      for (const k of ['summary', 'seasonTotals']) await qc.invalidateQueries({ queryKey: [k, match.season_id] });
      setSaved(true);
    } catch (e) {
      setError(e);
    }
  };

  const name = (id: string | null) => squad.find((p) => p.id === id)?.name ?? '—';
  if (!canEdit) {
    return (
      <main className="page narrow">
        <section className="card report-view">
          <dl className="facts">
            <dt>Score</dt>
            <dd>{match.goals_for != null ? `${match.goals_for}–${match.goals_against}` : 'Not played yet'}</dd>
            {match.captain_id && (<><dt>Captain</dt><dd>{name(match.captain_id)}</dd></>)}
            {match.potm_id && (<><dt>Player of the match</dt><dd>{name(match.potm_id)}</dd></>)}
            {match.venue && (<><dt>Venue</dt><dd>{match.venue}{match.surface ? ` (${match.surface})` : ''}</dd></>)}
            {match.referee && (<><dt>Referee</dt><dd>{match.referee}</dd></>)}
          </dl>
          {match.report ? <p className="report-text">{match.report}</p> : <p className="muted">No match report yet.</p>}
        </section>
      </main>
    );
  }

  const playerSelect = (value: string | null, onChange: (v: string | null) => void) => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">—</option>
      {squad.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <main className="page narrow">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="field-row three">
          <label className="field">
            <span>Goals for</span>
            <input type="number" min={0} inputMode="numeric" value={f.goals_for ?? ''} onChange={(e) => set({ goals_for: num(e.target.value) })} />
          </label>
          <label className="field">
            <span>Goals against</span>
            <input type="number" min={0} inputMode="numeric" value={f.goals_against ?? ''} onChange={(e) => set({ goals_against: num(e.target.value) })} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={f.status} onChange={(e) => set({ status: e.target.value as MatchStatus })}>
              <option value="fixture">Fixture</option>
              <option value="played">Played</option>
              <option value="postponed">Postponed</option>
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Captain</span>
            {playerSelect(f.captain_id, (v) => set({ captain_id: v }))}
          </label>
          <label className="field">
            <span>Player of the match</span>
            {playerSelect(f.potm_id, (v) => set({ potm_id: v }))}
          </label>
        </div>
        <label className="field">
          <span>Match report</span>
          <textarea rows={8} value={f.report} onChange={(e) => set({ report: e.target.value })} placeholder="How did it go? Goals, chances, standout moments…" />
        </label>

        <details>
          <summary>Fixture details</summary>
          <div className="field-row">
            <label className="field">
              <span>Date</span>
              <input type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label className="field">
              <span>Kick-off</span>
              <input type="time" value={f.kickoff?.slice(0, 5) ?? ''} onChange={(e) => set({ kickoff: e.target.value || null })} />
            </label>
          </div>
          <label className="field">
            <span>Opponent</span>
            <input value={f.opponent} onChange={(e) => set({ opponent: e.target.value })} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Home / away</span>
              <select value={f.side ?? ''} onChange={(e) => set({ side: (e.target.value || null) as MatchSide | null })}>
                <option value="">—</option>
                <option value="home">Home</option>
                <option value="away">Away</option>
                <option value="neutral">Neutral</option>
              </select>
            </label>
            <label className="field">
              <span>Competition</span>
              <input value={f.competition} onChange={(e) => set({ competition: e.target.value })} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Venue</span>
              <input value={f.venue} onChange={(e) => set({ venue: e.target.value })} />
            </label>
            <label className="field">
              <span>Surface</span>
              <select value={f.surface} onChange={(e) => set({ surface: e.target.value })}>
                <option value="">—</option>
                <option>Grass</option>
                <option>3G</option>
                <option>Astro</option>
                <option>Indoor</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Referee</span>
              <input value={f.referee} onChange={(e) => set({ referee: e.target.value })} />
            </label>
            <label className="field">
              <span>Match length (min)</span>
              <input type="number" min={1} value={f.duration_minutes} onChange={(e) => set({ duration_minutes: Number(e.target.value) || 60 })} />
            </label>
          </div>
        </details>

        <div className="row-actions">
          <button className="primary" disabled={!dirty}>
            Save
          </button>
          {f.status !== 'played' && f.goals_for != null && f.goals_against != null && (
            <button type="button" onClick={() => save({ status: 'played' }).then(() => navigate(path(`matches/${match.id}/stats`)))}>
              Save as played & enter stats
            </button>
          )}
          {saved && !dirty && <span className="save-indicator saved">Saved ✓</span>}
        </div>
        <ErrorBox error={error} />
      </form>
      <p>
        <ActionButton
          className="link danger"
          confirm="Delete this match, its team sheet and stats?"
          onClick={async () => {
            await deleteRows('matches', { id: match.id });
            await qc.invalidateQueries();
            navigate(path('fixtures'));
          }}
        >
          Delete match
        </ActionButton>
      </p>
    </main>
  );
}
