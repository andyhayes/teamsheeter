import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ActionButton, Empty, ErrorBox, Loading } from '../components/ui';
import type { Match, MatchSide } from '../lib/db-types';
import { formatDate, outcome, scoreline, sideLabel } from '../lib/format';
import { insertRow, useMatches, useSheetIds, useSquad } from '../lib/queries';
import { createTeamSheet } from '../lib/sheet-db';
import { useTeam } from '../lib/team-context';

export function FixturesPage() {
  const { season, teamId, canEdit, path } = useTeam();
  const matches = useMatches(season?.id);
  const sheets = useSheetIds(teamId);
  const squad = useSquad(season?.id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);
  const all = matches.data ?? [];
  const upcoming = all.filter((m) => m.status === 'fixture' && m.date >= today);
  const past = all.filter((m) => !upcoming.includes(m)).reverse();

  const makeSheet = async (m: Match) => {
    await createTeamSheet(m, squad.data ?? []);
    await qc.invalidateQueries({ queryKey: ['sheetIds', teamId] });
    navigate(path(`matches/${m.id}`));
  };

  const row = (m: Match) => {
    const hasSheet = sheets.data?.has(m.id);
    const o = outcome(m);
    return (
      <li key={m.id} className="fixture-row">
        <Link to={path(`matches/${m.id}${m.status === 'played' ? '/result' : ''}`)} className="fixture-main">
          <span className="fixture-date">{formatDate(m.date)}</span>
          <span className="fixture-opp">
            {m.opponent || 'TBC'}
            <span className="muted small"> {[sideLabel(m.side), m.competition].filter(Boolean).join(' · ')}</span>
          </span>
          {m.status === 'postponed' ? (
            <span className="muted small">Postponed</span>
          ) : (
            o && <span className={`result-pill ${o}`}>{o} {scoreline(m)}</span>
          )}
        </Link>
        <span className="fixture-sheet">
          {hasSheet ? (
            <Link to={path(`matches/${m.id}`)}>Team sheet</Link>
          ) : canEdit && m.status === 'fixture' ? (
            <ActionButton className="small-button" onClick={() => makeSheet(m)} disabled={!squad.data?.length} title={squad.data?.length ? '' : 'Add players to the squad first'}>
              Create team sheet
            </ActionButton>
          ) : null}
        </span>
      </li>
    );
  };

  return (
    <main className="page narrow">
      <ErrorBox error={matches.error ?? sheets.error} />
      {canEdit && <NewFixtureForm />}
      <h2 className="section-title">Upcoming</h2>
      {matches.isLoading ? (
        <Loading />
      ) : upcoming.length ? (
        <ul className="fixture-list card">{upcoming.map(row)}</ul>
      ) : (
        <Empty>No upcoming fixtures{canEdit ? ', so add one above.' : '.'}</Empty>
      )}
      {past.length > 0 && (
        <>
          <h2 className="section-title">Results</h2>
          <ul className="fixture-list card">{past.map(row)}</ul>
        </>
      )}
    </main>
  );
}

function NewFixtureForm() {
  const { season, teamId } = useTeam();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: '', kickoff: '', opponent: '', side: 'home' as MatchSide, competition: '', venue: '' });
  const [error, setError] = useState<unknown>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  if (!open) {
    return (
      <button className="primary" onClick={() => setOpen(true)}>
        + Add fixture
      </button>
    );
  }
  const save = async () => {
    setError(null);
    try {
      await insertRow('matches', { team_id: teamId, season_id: season!.id, ...f, kickoff: f.kickoff || null });
      await qc.invalidateQueries({ queryKey: ['matches', season!.id] });
      setF((x) => ({ ...x, date: '', kickoff: '', opponent: '', venue: '' }));
      setOpen(false);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h2>New fixture</h2>
      <div className="field-row">
        <label className="field">
          <span>Date</span>
          <input type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field">
          <span>Kick-off</span>
          <input type="time" value={f.kickoff} onChange={(e) => set({ kickoff: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Opponent</span>
        <input required value={f.opponent} onChange={(e) => set({ opponent: e.target.value })} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Home / away</span>
          <select value={f.side} onChange={(e) => set({ side: e.target.value as MatchSide })}>
            <option value="home">Home</option>
            <option value="away">Away</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
        <label className="field">
          <span>Competition</span>
          <input value={f.competition} onChange={(e) => set({ competition: e.target.value })} placeholder="League, Cup, Friendly…" />
        </label>
      </div>
      <label className="field">
        <span>Venue</span>
        <input value={f.venue} onChange={(e) => set({ venue: e.target.value })} />
      </label>
      <div className="row-actions">
        <button className="primary">Add fixture</button>
        <button type="button" className="link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <ErrorBox error={error} />
    </form>
  );
}
