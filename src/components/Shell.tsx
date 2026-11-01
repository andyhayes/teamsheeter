import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMyTeams } from '../lib/queries';
import { supabase } from '../lib/supabase';

/** Top bar: brand, team switcher (only the user's own teams, grouped by club) and account. */
export function Shell({ children, nav }: { children: ReactNode; nav?: ReactNode }) {
  const { session } = useAuth();
  const { data: teams } = useMyTeams();
  const { club, team } = useParams();
  const navigate = useNavigate();
  const current = club && team ? `${club}/${team}` : '';

  const clubs = new Map<string, NonNullable<typeof teams>>();
  for (const t of teams ?? []) clubs.set(t.club_name, [...(clubs.get(t.club_name) ?? []), t]);

  return (
    <div className="app">
      <header className="topbar no-print">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden>
            ⚽
          </span>
          Teamsheeter
        </Link>
        {teams && teams.length > 0 && (
          <select
            className="team-switcher"
            value={current}
            onChange={(e) => navigate(e.target.value ? `/${e.target.value}` : '/')}
            aria-label="Switch team"
          >
            {!current && <option value="">Choose a team…</option>}
            {[...clubs].map(([clubName, list]) => (
              <optgroup key={clubName} label={clubName}>
                {list.map((t) => (
                  <option key={t.team_id} value={`${t.club_slug}/${t.team_slug}`}>
                    {t.team_name} · {t.role}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        {nav}
        <div className="account">
          <span className="muted small">{session?.user.email}</span>
          <button className="link" onClick={() => supabase?.auth.signOut().then(() => navigate('/login'))}>
            Sign out
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
