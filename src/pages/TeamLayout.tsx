import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Empty, ErrorBox, Loading } from '../components/ui';
import type { Season } from '../lib/db-types';
import { currentSeasonLabel } from '../lib/format';
import { insertRow, useMyTeams, useSeasons } from '../lib/queries';
import { TeamContext, useTeam, type TeamContextValue } from '../lib/team-context';

const seasonKey = (teamId: string) => `teamsheeter:season:${teamId}`;

function readSeasonChoice(teamId: string) {
  try {
    return localStorage.getItem(seasonKey(teamId));
  } catch {
    return null;
  }
}

export function TeamLayout() {
  const { club, team } = useParams();
  const myTeams = useMyTeams();
  const membership = myTeams.data?.find((t) => t.club_slug === club && t.team_slug === team);
  const seasons = useSeasons(membership?.team_id);
  const [seasonId, setSeasonIdState] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (membership) setSeasonIdState(readSeasonChoice(membership.team_id));
  }, [membership?.team_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo((): TeamContextValue | null => {
    if (!membership) return null;
    const list = seasons.data ?? [];
    const base = `/${membership.club_slug}/${membership.team_slug}`;
    return {
      membership,
      teamId: membership.team_id,
      canEdit: membership.role === 'coach',
      seasons: list,
      season: list.find((s) => s.id === seasonId) ?? list[0] ?? null,
      setSeasonId: (id) => {
        setSeasonIdState(id);
        try {
          localStorage.setItem(seasonKey(membership.team_id), id);
        } catch {
          // Remembering the choice is a convenience only.
        }
      },
      path: (sub = '') => (sub ? `${base}/${sub}` : base),
    };
  }, [membership, seasons.data, seasonId]);

  if (myTeams.isLoading) return <Shell><Loading /></Shell>;
  if (!ctx) {
    return (
      <Shell>
        <main className="page narrow">
          <ErrorBox error={myTeams.error} />
          <Empty>
            <p>You're not a member of this team.</p>
            <p className="muted">
              Ask one of its coaches for an invite. Club admins can add themselves from the <Link to={`/${club}`}>club page</Link>.
            </p>
          </Empty>
        </main>
      </Shell>
    );
  }

  const nav = (
    <nav className="tabs team-nav">
      <NavLink end to={ctx.path()}>Home</NavLink>
      <NavLink to={ctx.path('fixtures')}>Fixtures</NavLink>
      <NavLink to={ctx.path('squad')}>Squad</NavLink>
      <NavLink to={ctx.path('season')}>Stats</NavLink>
      <NavLink to={ctx.path('defence')}>Defence</NavLink>
      <NavLink to={ctx.path('records')}>Records</NavLink>
      {ctx.canEdit && <NavLink to={ctx.path('settings')}>Settings</NavLink>}
    </nav>
  );

  const needsSeason = !seasons.isLoading && ctx.seasons.length === 0 && !location.pathname.endsWith('/settings');
  return (
    <TeamContext.Provider value={ctx}>
      <Shell nav={nav}>
        <div className="team-bar no-print">
          <span className="team-name">
            {membership!.club_name} · <b>{membership!.team_name}</b>
          </span>
          {ctx.seasons.length > 0 && (
            <select value={ctx.season?.id ?? ''} onChange={(e) => ctx.setSeasonId(e.target.value)} aria-label="Season">
              {ctx.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.age_group ? ` · ${s.age_group}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <ErrorBox error={seasons.error} />
        {seasons.isLoading ? <Loading /> : needsSeason ? <FirstSeason /> : <Outlet />}
      </Shell>
    </TeamContext.Provider>
  );
}

function FirstSeason() {
  const qc = useQueryClient();
  const { teamId, canEdit, setSeasonId } = useTeam();
  const [label, setLabel] = useState(currentSeasonLabel());
  const [age, setAge] = useState('');
  const [format, setFormat] = useState('9v9');
  const [error, setError] = useState<unknown>(null);
  if (!canEdit) return <main className="page narrow"><Empty>This team hasn't started a season yet.</Empty></main>;
  const create = async () => {
    try {
      const s = await insertRow<Season>('seasons', { team_id: teamId, label, age_group: age, format });
      setSeasonId(s.id);
      await qc.invalidateQueries({ queryKey: ['seasons', teamId] });
    } catch (e) {
      setError(e);
    }
  };
  return (
    <main className="page narrow">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <h2>Start your first season</h2>
        <div className="field-row three">
          <label className="field">
            <span>Season</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="field">
            <span>Age group</span>
            <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="U13" />
          </label>
          <label className="field">
            <span>Format</span>
            <input value={format} onChange={(e) => setFormat(e.target.value)} />
          </label>
        </div>
        <button className="primary" disabled={!label.trim()}>
          Start season
        </button>
        <ErrorBox error={error} />
      </form>
    </main>
  );
}
