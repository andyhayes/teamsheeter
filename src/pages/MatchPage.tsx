import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { TeamSheetBuilder } from '../components/TeamSheetBuilder';
import { ActionButton, Empty, ErrorBox, Loading, SaveIndicator } from '../components/ui';
import { clearDraft, readDraft, useAutosave } from '../lib/autosave';
import type { Match, TeamSheetRow } from '../lib/db-types';
import { formatDate, outcome, scoreline, sideLabel } from '../lib/format';
import { latestTeamSheet, updateRow, useMatch, useSquad, useTeamSheet, type SquadPlayer } from '../lib/queries';
import { copySheet, createTeamSheet, rowFromSheetState, sheetStateFromRow } from '../lib/sheet-db';
import type { SheetState } from '../lib/sheet-state';
import { useTeam } from '../lib/team-context';
import { ResultTab } from './match/ResultTab';
import { SheetView } from './match/SheetView';
import { StatsTab } from './match/StatsTab';

export function MatchPage() {
  const { matchId, tab = 'sheet' } = useParams();
  const { path, membership } = useTeam();
  const match = useMatch(matchId);
  const squad = useSquad(match.data?.season_id);

  if (match.isLoading || squad.isLoading) return <Loading />;
  if (!match.data) return <main className="page narrow"><Empty>Match not found.</Empty></main>;
  const m = match.data;
  const o = outcome(m);
  const base = path(`matches/${m.id}`);

  return (
    <>
      <div className="match-head no-print">
        <div>
          <h1>
            {membership.club_name} vs {m.opponent || 'TBC'} {o && <span className={`result-pill ${o}`}>{o} {scoreline(m)}</span>}
          </h1>
          <p className="muted">
            {[formatDate(m.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), m.kickoff?.slice(0, 5), sideLabel(m.side), m.competition, m.venue]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <nav className="tabs">
          <NavLink end to={base} className={tab === 'sheet' || tab === 'edit' ? 'active' : ''}>
            Team sheet
          </NavLink>
          <NavLink to={`${base}/result`}>Result & report</NavLink>
          <NavLink to={`${base}/stats`}>Stats</NavLink>
        </nav>
      </div>
      <ErrorBox error={match.error ?? squad.error} />
      {tab === 'result' ? (
        <ResultTab match={m} squad={squad.data ?? []} />
      ) : tab === 'stats' ? (
        <StatsTab match={m} squad={squad.data ?? []} />
      ) : (
        <SheetTab match={m} squad={squad.data ?? []} editing={tab === 'edit'} />
      )}
    </>
  );
}

const draftKey = (matchId: string) => `teamsheeter:draft:sheet:${matchId}`;

function SheetTab({ match, squad, editing }: { match: Match; squad: SquadPlayer[]; editing: boolean }) {
  const { canEdit, membership, path } = useTeam();
  const sheet = useTeamSheet(match.id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (sheet.isLoading) return <Loading what="team sheet" />;
  if (!sheet.data) {
    if (!canEdit) return <main className="page narrow"><Empty>The team sheet hasn't been made yet.</Empty></main>;
    return (
      <main className="page narrow">
        <Empty>
          <p>No team sheet yet for this fixture.</p>
          <p className="muted">
            It starts with the {squad.length} players in this season's squad and their preferred positions, using your last
            formation and substitution periods.
          </p>
          {squad.length ? (
            <ActionButton
              className="primary"
              onClick={async () => {
                await createTeamSheet(match, squad);
                await qc.invalidateQueries({ queryKey: ['sheet', match.id] });
                await qc.invalidateQueries({ queryKey: ['sheetIds', match.team_id] });
                navigate(path(`matches/${match.id}/edit`));
              }}
            >
              Create team sheet
            </ActionButton>
          ) : (
            <p>Add players on the Squad page first.</p>
          )}
        </Empty>
      </main>
    );
  }
  return (
    <SheetScreen
      key={match.id}
      match={match}
      squad={squad}
      row={sheet.data}
      canEdit={canEdit}
      editing={editing && canEdit}
      teamName={membership.club_name}
    />
  );
}

/**
 * A saved team sheet, shown as it prints with match stats entry (the default) or in the full
 * builder (Edit). Both modes share one state and autosave, so switching never loses an edit.
 */
function SheetScreen({
  match,
  squad,
  row,
  canEdit,
  editing,
  teamName,
}: {
  match: Match;
  squad: SquadPlayer[];
  row: TeamSheetRow;
  canEdit: boolean;
  editing: boolean;
  teamName: string;
}) {
  const qc = useQueryClient();
  const { path } = useTeam();
  const base = path(`matches/${match.id}`);
  const key = draftKey(match.id);
  // Prefer an unsaved local draft that is newer than the server copy (e.g. edited offline).
  const [initial] = useState(() => {
    const draft = canEdit ? readDraft<Partial<TeamSheetRow>>(key) : null;
    const useDraft = draft && draft.savedAt > Date.parse(row.updated_at);
    if (draft && !useDraft) clearDraft(key);
    return sheetStateFromRow(match, teamName, squad, useDraft ? { ...row, ...draft.value } : row);
  });
  const [state, setState] = useState<SheetState>(initial);
  const [baseline] = useState(() => rowFromSheetState(sheetStateFromRow(match, teamName, squad, row)));
  const onChange = useCallback((fn: (s: SheetState) => SheetState) => setState(fn), []);

  const value = useMemo(() => (canEdit ? rowFromSheetState(state) : null), [state, canEdit]);
  const save = useCallback(
    async (v: ReturnType<typeof rowFromSheetState>) => {
      await updateRow('team_sheets', { match_id: match.id }, v);
      qc.setQueryData(['sheet', match.id], (old: TeamSheetRow | undefined) => (old ? { ...old, ...v, updated_at: new Date().toISOString() } : old));
    },
    [match.id, qc],
  );
  const { status, error } = useAutosave(value, baseline, save, key);

  // Keep the fixture details in the sheet header in step with edits on the Result tab.
  useEffect(() => {
    setState((s) => ({
      ...s,
      fixture: {
        ...s.fixture,
        date: match.date,
        opponent: match.opponent,
        venue: match.side === 'home' || match.side === 'away' ? match.side : '',
      },
    }));
  }, [match.date, match.opponent, match.side]);

  const copyPrevious = async () => {
    const prev = await latestTeamSheet(match.team_id, match.id);
    if (!prev) throw new Error('No other team sheets to copy yet');
    setState(sheetStateFromRow(match, teamName, squad, { ...row, ...copySheet(prev, squad) }));
  };

  if (!editing) {
    const toolbar = canEdit ? (
      <>
        <SaveIndicator status={status} error={error} />
        <Link className="button primary" to={`${base}/edit`}>
          Edit
        </Link>
      </>
    ) : null;
    return <SheetView match={match} squad={squad} state={state} canEdit={canEdit} toolbar={toolbar} />;
  }

  const toolbar = (
    <>
      <SaveIndicator status={status} error={error} />
      <ActionButton onClick={copyPrevious} confirm="Replace with last sheet?" title="Start from your most recent other team sheet">
        Copy previous
      </ActionButton>
    </>
  );
  const done = (
    <Link className="button primary" to={base}>
      Done
    </Link>
  );
  return <TeamSheetBuilder state={state} onChange={onChange} fixtureFields={false} toolbar={toolbar} primaryAction={done} />;
}
