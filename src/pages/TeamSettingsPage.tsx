import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InvitesPanel, MembersPanel } from '../components/MembersPanel';
import { ActionButton, Empty, ErrorBox } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { Season } from '../lib/db-types';
import { nextAgeGroup, nextSeasonLabel } from '../lib/format';
import { deleteRows, insertRow, updateRow } from '../lib/queries';
import { db, must } from '../lib/supabase';
import { useTeam } from '../lib/team-context';

export function TeamSettingsPage() {
  const { canEdit, membership, teamId, seasons, setSeasonId } = useTeam();
  const { session } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(membership.team_name);

  if (!canEdit) return <main className="page narrow"><Empty>Only coaches can change team settings.</Empty></main>;

  const latest = seasons[0];
  const startNext = async () => {
    const label = nextSeasonLabel(latest.label) || `${latest.label} (next)`;
    const next = await insertRow<Season>('seasons', { team_id: teamId, label, age_group: nextAgeGroup(latest.age_group), format: latest.format });
    // Carry the squad over in the same order.
    const squad = must(await db().from('season_squads').select('player_id, sort_order, shirt_no').eq('season_id', latest.id)) as { player_id: string; sort_order: number; shirt_no: number | null }[];
    if (squad.length) must(await db().from('season_squads').insert(squad.map((s) => ({ ...s, season_id: next.id, team_id: teamId }))));
    setSeasonId(next.id);
    await qc.invalidateQueries({ queryKey: ['seasons', teamId] });
  };

  return (
    <main className="page narrow">
      <section className="card">
        <h2>Team</h2>
        <div className="invite-form">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Team name" />
          <ActionButton
            className="primary"
            disabled={!name.trim() || name === membership.team_name}
            onClick={() => updateRow('teams', { id: teamId }, { name: name.trim() }).then(() => qc.invalidateQueries({ queryKey: ['myTeams'] }))}
          >
            Rename
          </ActionButton>
        </div>
        <p className="muted small">{membership.club_name}. The team's web address stays the same when it's renamed.</p>
      </section>

      <section className="card">
        <h2>Seasons</h2>
        <SeasonList seasons={seasons} />
        {latest && (
          <ActionButton onClick={startNext} confirm={`Start ${nextSeasonLabel(latest.label) || 'next season'}?`}>
            Start {nextSeasonLabel(latest.label) || 'next season'}
            {latest.age_group ? ` (${nextAgeGroup(latest.age_group)})` : ''}, copying the squad
          </ActionButton>
        )}
      </section>

      <section className="card">
        <h2>Coaches & parents</h2>
        <p className="muted small">Coaches can edit everything for this team. Parents can view the team sheets, results and stats.</p>
        <MembersPanel teamId={teamId} canManage />
        <h3>Invite</h3>
        <InvitesPanel clubId={membership.club_id} teamId={teamId} roles={['parent', 'coach']} />
      </section>

      <p>
        <ActionButton
          className="link danger"
          confirm="Leave this team?"
          onClick={async () => {
            await deleteRows('team_members', { team_id: teamId, user_id: session!.user.id });
            await qc.invalidateQueries();
            navigate('/');
          }}
        >
          Leave this team
        </ActionButton>
      </p>
    </main>
  );
}

function SeasonList({ seasons }: { seasons: Season[] }) {
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const save = async (s: Season, patch: Partial<Season>) => {
    try {
      await updateRow('seasons', { id: s.id }, patch);
      await qc.invalidateQueries({ queryKey: ['seasons', s.team_id] });
    } catch (e) {
      setError(e);
    }
  };
  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            <th>Season</th>
            <th>Age group</th>
            <th>Format</th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={s.id}>
              <td>
                <input defaultValue={s.label} onBlur={(e) => e.target.value !== s.label && save(s, { label: e.target.value })} />
              </td>
              <td>
                <input defaultValue={s.age_group} onBlur={(e) => e.target.value !== s.age_group && save(s, { age_group: e.target.value })} />
              </td>
              <td>
                <input defaultValue={s.format} onBlur={(e) => e.target.value !== s.format && save(s, { format: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorBox error={error} />
    </>
  );
}
