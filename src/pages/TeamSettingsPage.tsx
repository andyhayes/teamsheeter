import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InvitesPanel, MembersPanel } from '../components/MembersPanel';
import { copySquad, SeasonForm, type SeasonFields } from '../components/SeasonForm';
import { ActionButton, Empty, ErrorBox } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { Season } from '../lib/db-types';
import { currentSeasonLabel, nextAgeGroup, nextSeasonLabel } from '../lib/format';
import { deleteRows, insertRow, updateRow, useSeasonMatchCounts } from '../lib/queries';
import { useTeam } from '../lib/team-context';

export function TeamSettingsPage() {
  const { canEdit, membership, teamId } = useTeam();
  const { session } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(membership.team_name);

  if (!canEdit) return <main className="page narrow"><Empty>Only coaches can change team settings.</Empty></main>;

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
        <SeasonList />
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
            await deleteRows('team_members', {
              team_id: teamId,
              user_id: session!.user.id,
            });
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

function SeasonList() {
  const qc = useQueryClient();
  const { teamId, seasons, season: current, setSeasonId } = useTeam();
  const counts = useSeasonMatchCounts(teamId);
  const [editing, setEditing] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [copyFrom, setCopyFrom] = useState(seasons[0]?.id ?? '');

  // Suggest the season after the newest one, wherever it sits in the list.
  const latest = seasons.reduce<Season | undefined>((a, s) => (!a || s.label > a.label ? s : a), undefined);
  const suggested: SeasonFields = latest
    ? { label: nextSeasonLabel(latest.label), age_group: nextAgeGroup(latest.age_group), format: latest.format }
    : { label: currentSeasonLabel(), age_group: '', format: '9v9' };

  const add = async (f: SeasonFields) => {
    // New seasons go to the top of the list.
    const top = Math.min(0, ...seasons.map((x) => x.sort_order)) - 1;
    const s = await insertRow<Season>('seasons', { team_id: teamId, ...f, sort_order: top });
    if (copyFrom) await copySquad(copyFrom, s.id, teamId);
    setSeasonId(s.id);
    setAdding(false);
    await qc.invalidateQueries({ queryKey: ['seasons', teamId] });
  };
  const save = async (s: Season, f: SeasonFields) => {
    await updateRow('seasons', { id: s.id }, f);
    setEditing(null);
    // Labels show up in records and player history as well as the season picker.
    await qc.invalidateQueries();
  };
  const move = async (from: number, to: number) => {
    const next = [...seasons];
    next.splice(to, 0, ...next.splice(from, 1));
    const renumbered = next.map((s, i) => ({ ...s, sort_order: i }));
    const key = ['seasons', teamId];
    qc.setQueryData(key, renumbered);
    setOrderError(null);
    try {
      const before = new Map(seasons.map((s) => [s.id, s.sort_order]));
      const changed = renumbered.filter((s) => before.get(s.id) !== s.sort_order);
      await Promise.all(changed.map((s) => updateRow('seasons', { id: s.id }, { sort_order: s.sort_order })));
    } catch (e) {
      setOrderError(e);
    }
    await qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (s: Season) => {
    await deleteRows('seasons', { id: s.id });
    // Matches, sheets and stats go with it, so refresh everything.
    await qc.invalidateQueries();
  };

  return (
    <>
      {seasons.length ? (
        <ul className="member-list season-list">
          {seasons.map((s, i) => {
            const n = counts.data?.[s.id] ?? 0;
            if (editing === s.id) {
              return (
                <li key={s.id}>
                  <SeasonForm initial={s} submitLabel="Save" onSubmit={(f) => save(s, f)} onCancel={() => setEditing(null)} />
                </li>
              );
            }
            return (
              <li key={s.id}>
                <span>
                  <b>{s.label}</b>
                  {s.id === current?.id && <span className="muted small"> (showing)</span>}
                  <span className="muted small">
                    {' · '}
                    {[s.age_group, s.format, counts.data ? `${n} match${n === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="reorder">
                  <button className="link" disabled={i === 0} onClick={() => move(i, i - 1)} title="Move up" aria-label={`Move ${s.label} up`}>
                    ↑
                  </button>
                  <button
                    className="link"
                    disabled={i === seasons.length - 1}
                    onClick={() => move(i, i + 1)}
                    title="Move down"
                    aria-label={`Move ${s.label} down`}
                  >
                    ↓
                  </button>
                </span>
                <button className="link" onClick={() => setEditing(s.id)}>
                  Edit
                </button>
                <ActionButton
                  className="link danger"
                  confirm={n ? `Delete ${s.label} and its ${n} match${n === 1 ? '' : 'es'}?` : `Delete ${s.label}?`}
                  onClick={() => remove(s)}
                >
                  Delete
                </ActionButton>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">No seasons yet.</p>
      )}

      {adding ? (
        <>
          <h3>Add a season</h3>
          <SeasonForm initial={suggested} submitLabel="Add season" onSubmit={add} onCancel={() => setAdding(false)}>
            {seasons.length > 0 && (
              <label className="field">
                <span>Squad</span>
                <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  <option value="">Start with an empty squad</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      Copy the {s.label} squad
                    </option>
                  ))}
                </select>
              </label>
            )}
          </SeasonForm>
        </>
      ) : (
        <p>
          <button
            onClick={() => {
              setCopyFrom(seasons[0]?.id ?? '');
              setAdding(true);
            }}
          >
            + Add season
          </button>
        </p>
      )}
      <ErrorBox error={orderError} />
      <p className="muted small">The season at the top is shown by default, and the season picker follows this order. Deleting a season also deletes its fixtures, team sheets and stats. Players stay on the team.</p>
    </>
  );
}
