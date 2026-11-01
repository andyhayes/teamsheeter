import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InvitesPanel, MembersPanel } from '../components/MembersPanel';
import { Shell } from '../components/Shell';
import { ActionButton, Empty, ErrorBox, Loading, RoleBadge } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { Team } from '../lib/db-types';
import { slugify } from '../lib/format';
import { insertRow, updateRow, useAdminClubIds, useClub, useClubAdmins, useClubTeams, useMyTeams } from '../lib/queries';

/**
 * A club's home. Members see their own teams here. Admins also manage every team and its
 * members and invites, but never see a team's fixtures, players or stats unless they join it.
 */
export function ClubPage() {
  const { club: slug } = useParams();
  const { session } = useAuth();
  const club = useClub(slug);
  const myTeams = useMyTeams();
  const adminOf = useAdminClubIds(session?.user.id);
  const isAdmin = !!club.data && !!adminOf.data?.includes(club.data.id);
  const teams = useClubTeams(isAdmin ? club.data?.id : undefined);

  if (club.isLoading || adminOf.isLoading) return <Shell><Loading /></Shell>;
  if (!club.data) return <Shell><main className="page narrow"><Empty>Club not found, or you're not a member.</Empty></main></Shell>;

  const mine = (myTeams.data ?? []).filter((t) => t.club_id === club.data!.id);
  return (
    <Shell>
      <main className="page narrow">
        <ErrorBox error={club.error ?? teams.error} />
        <h1>{club.data.name}</h1>

        {mine.length > 0 && (
          <section className="card">
            <h2>Your teams</h2>
            <ul className="link-list">
              {mine.map((t) => (
                <li key={t.team_id}>
                  <Link to={`/${slug}/${t.team_slug}`}>{t.team_name}</Link>
                  <RoleBadge role={t.role} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {isAdmin && (
          <>
            <h2 className="section-title">Teams</h2>
            <p className="muted small">
              As a club admin you can add teams and manage who's in them. To see a team's fixtures and stats, add yourself
              as its coach.
            </p>
            {teams.isLoading && <Loading what="teams" />}
            {(teams.data ?? [])
              .filter((t) => !t.archived_at)
              .map((t) => (
                <TeamAdminCard key={t.id} team={t} clubSlug={slug!} myRole={mine.find((m) => m.team_id === t.id)?.role} />
              ))}
            <NewTeamForm clubId={club.data.id} />
            {(teams.data ?? []).some((t) => t.archived_at) && (
              <details className="card">
                <summary>Archived teams</summary>
                <ul className="link-list">
                  {(teams.data ?? [])
                    .filter((t) => t.archived_at)
                    .map((t) => (
                      <li key={t.id}>
                        {t.name}
                        <ActionButton className="link" onClick={() => updateRow('teams', { id: t.id }, { archived_at: null }).then(() => teams.refetch())}>
                          Restore
                        </ActionButton>
                      </li>
                    ))}
                </ul>
              </details>
            )}
            <ClubAdminsCard clubId={club.data.id} />
          </>
        )}
      </main>
    </Shell>
  );
}

function TeamAdminCard({ team, clubSlug, myRole }: { team: Team; clubSlug: string; myRole?: string }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const refresh = () => qc.invalidateQueries();
  return (
    <section className="card">
      <div className="card-head">
        <h2>{myRole ? <Link to={`/${clubSlug}/${team.slug}`}>{team.name}</Link> : team.name}</h2>
        <div className="row-actions">
          {myRole ? (
            <RoleBadge role={myRole} />
          ) : (
            <ActionButton
              className="link"
              onClick={() => insertRow('team_members', { team_id: team.id, user_id: session!.user.id, role: 'coach' }).then(refresh)}
            >
              Join as coach
            </ActionButton>
          )}
          <button className="link" onClick={() => setOpen(!open)}>
            {open ? 'Hide members' : 'Members & invites'}
          </button>
          <ActionButton
            className="link danger"
            confirm="Archive team?"
            onClick={() => updateRow('teams', { id: team.id }, { archived_at: new Date().toISOString() }).then(refresh)}
          >
            Archive
          </ActionButton>
        </div>
      </div>
      {open && (
        <div className="team-admin">
          <MembersPanel teamId={team.id} canManage />
          <h3>Invite</h3>
          <InvitesPanel clubId={team.club_id} teamId={team.id} roles={['coach', 'parent']} />
        </div>
      )}
    </section>
  );
}

function NewTeamForm({ clubId }: { clubId: string }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [coach, setCoach] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const create = async () => {
    setError(null);
    try {
      const team = await insertRow<Team>('teams', { club_id: clubId, name: name.trim(), slug: slugify(name) });
      if (coach) await insertRow('team_members', { team_id: team.id, user_id: session!.user.id, role: 'coach' });
      setName('');
      await qc.invalidateQueries();
    } catch (e) {
      setError(/duplicate|unique/i.test(String(e)) ? new Error('There is already a team with that name.') : e);
    }
  };
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <h2>Add a team</h2>
      <p className="muted small">Name it after the age cohort (e.g. "2014s" or "Under 13s"). It keeps its history as it moves up each season.</p>
      <div className="invite-form">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
        <button className="primary" disabled={!slugify(name)}>
          Add team
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} /> I coach this team
      </label>
      <ErrorBox error={error} />
    </form>
  );
}

function ClubAdminsCard({ clubId }: { clubId: string }) {
  const admins = useClubAdmins(clubId);
  return (
    <section className="card">
      <h2>Club admins</h2>
      <ul className="member-list">
        {(admins.data ?? []).map((a) => (
          <li key={a.id}>{a.display_name || a.email}</li>
        ))}
      </ul>
      <h3>Invite another admin</h3>
      <InvitesPanel clubId={clubId} teamId={null} roles={['admin']} />
    </section>
  );
}
