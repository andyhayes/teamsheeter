import { useState } from 'react';
import { useAuth } from '../lib/auth';
import type { Invite, Role } from '../lib/db-types';
import { deleteRows, insertRow, updateRow, useInvites, useTeamMembers, useWrite } from '../lib/queries';
import { ActionButton, ErrorBox, Loading, RoleBadge } from './ui';

const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

/** Pending invites with copyable links, and a form to invite someone by email. */
export function InvitesPanel({
  clubId,
  teamId,
  roles,
}: {
  clubId: string;
  teamId: string | null;
  roles: Invite['role'][];
}) {
  const invites = useInvites(teamId ? { teamId } : { clubId });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Invite['role']>(roles[0]);
  const [copied, setCopied] = useState<string | null>(null);
  const key = ['invites', teamId ? { teamId } : { clubId }];
  const create = useWrite(
    () => insertRow<Invite>('invites', { club_id: clubId, team_id: teamId, email: email.trim().toLowerCase(), role }),
    () => [key],
  );
  const revoke = useWrite((id: string) => deleteRows('invites', { id }), () => [key]);

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(inviteLink(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="invites">
      <form
        className="invite-form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(undefined, { onSuccess: () => setEmail('') });
        }}
      >
        <input type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        {roles.length > 1 && (
          <select value={role} onChange={(e) => setRole(e.target.value as Invite['role'])}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <button className="primary" disabled={create.isPending || !email.includes('@')}>
          Invite
        </button>
      </form>
      <ErrorBox error={create.error} />
      <p className="muted small">
        Send the link to them (by text, WhatsApp or email). They sign in with that email address to join.
      </p>
      {invites.data && invites.data.length > 0 && (
        <ul className="invite-list">
          {invites.data.map((i) => (
            <li key={i.id}>
              <span>{i.email}</span>
              <RoleBadge role={i.role} />
              {new Date(i.expires_at) < new Date() ? (
                <span className="muted small">expired</span>
              ) : (
                <button className="link" onClick={() => copy(i.token)}>
                  {copied === i.token ? 'Link copied ✓' : 'Copy link'}
                </button>
              )}
              <button className="icon danger" title="Revoke invite" onClick={() => revoke.mutate(i.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A team's members with role changes and removal, for coaches and club admins. */
export function MembersPanel({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const { session } = useAuth();
  const members = useTeamMembers(teamId);
  const key = ['members', teamId];
  const setRole = useWrite(
    ({ userId, role }: { userId: string; role: Role }) => updateRow('team_members', { team_id: teamId, user_id: userId }, { role }),
    () => [key, ['myTeams']],
  );
  const remove = (userId: string) => deleteRows('team_members', { team_id: teamId, user_id: userId });

  if (members.isLoading) return <Loading what="members" />;
  const sorted = [...(members.data ?? [])].sort((a, b) => a.role.localeCompare(b.role) || (a.profiles?.email ?? '').localeCompare(b.profiles?.email ?? ''));
  return (
    <>
      <ErrorBox error={members.error ?? setRole.error} />
      <ul className="member-list">
        {sorted.map((m) => (
          <li key={m.user_id}>
            <span>
              {m.profiles?.display_name || m.profiles?.email || 'Unknown'}
              {m.user_id === session?.user.id && <span className="muted small"> (you)</span>}
            </span>
            {canManage ? (
              <select value={m.role} onChange={(e) => setRole.mutate({ userId: m.user_id, role: e.target.value as Role })}>
                <option value="coach">coach</option>
                <option value="parent">parent</option>
              </select>
            ) : (
              <RoleBadge role={m.role} />
            )}
            {canManage && (
              <ActionButton className="icon danger" title="Remove from team" confirm="Remove?" onClick={() => remove(m.user_id).then(() => members.refetch())}>
                ×
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
