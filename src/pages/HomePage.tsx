import { Link, Navigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Empty, ErrorBox, Loading, RoleBadge } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useAdminClubIds, useMyClubs, useMyTeams } from '../lib/queries';

/** The user's teams across every club, plus clubs they administer. */
export function HomePage() {
  const { session } = useAuth();
  const teams = useMyTeams();
  const clubs = useMyClubs();
  const adminOf = useAdminClubIds(session?.user.id);

  if (teams.isLoading || clubs.isLoading || adminOf.isLoading) return <Shell><Loading /></Shell>;
  const adminClubs = (clubs.data ?? []).filter((c) => adminOf.data?.includes(c.id));
  // Someone with a single team and nothing to administer goes straight to it.
  if (teams.data?.length === 1 && adminClubs.length === 0) {
    const t = teams.data[0];
    return <Navigate to={`/${t.club_slug}/${t.team_slug}`} replace />;
  }

  const byClub = new Map<string, NonNullable<typeof teams.data>>();
  for (const t of teams.data ?? []) byClub.set(t.club_slug, [...(byClub.get(t.club_slug) ?? []), t]);

  return (
    <Shell>
      <main className="page narrow">
        <ErrorBox error={teams.error ?? clubs.error} />
        <h1>Your teams</h1>
        {byClub.size === 0 && (
          <Empty>
            <p>You're not in any teams yet.</p>
            <p className="muted">
              If you're a parent or coach, ask your team's coach to invite you. If you're setting up your club, create it below.
            </p>
          </Empty>
        )}
        {[...byClub].map(([slug, list]) => (
          <section key={slug} className="card">
            <div className="card-head">
              <h2>{list[0].club_name}</h2>
              {adminOf.data?.includes(list[0].club_id) && (
                <Link to={`/${slug}`} className="small">
                  Manage club
                </Link>
              )}
            </div>
            <ul className="link-list">
              {list.map((t) => (
                <li key={t.team_id}>
                  <Link to={`/${t.club_slug}/${t.team_slug}`}>{t.team_name}</Link>
                  <RoleBadge role={t.role} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {adminClubs.filter((c) => !byClub.has(c.slug)).length > 0 && <h2 className="section-title">Clubs you manage</h2>}
        {adminClubs
          .filter((c) => !byClub.has(c.slug))
          .map((c) => (
            <section key={c.id} className="card">
              <div className="card-head">
                <h2>{c.name}</h2>
                <Link to={`/${c.slug}`}>Manage club</Link>
              </div>
              <p className="muted small">You manage this club's teams and members, but aren't in any of its teams.</p>
            </section>
          ))}

        <p>
          <Link to="/clubs/new">+ Set up a new club</Link>
        </p>
      </main>
    </Shell>
  );
}
