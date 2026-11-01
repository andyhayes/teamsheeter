import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { db, must } from '../lib/supabase';
import { ErrorBox, Loading } from '../components/ui';

interface InviteDetails {
  club_name: string;
  team_name: string | null;
  role: string;
  email: string;
  expired: boolean;
  accepted: boolean;
}

export function InvitePage() {
  const { token } = useParams();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const details = useQuery({
    queryKey: ['invite', token],
    enabled: !!session,
    queryFn: async () => (must(await db().rpc('invite_details', { invite_token: token })) as InviteDetails[])[0] ?? null,
  });

  if (loading) return <Loading />;
  if (!session) {
    return (
      <main className="auth-page">
        <section className="card auth-card">
          <h1>You've been invited</h1>
          <p>Sign in with the email address the invite was sent to, and you'll come straight back here.</p>
          <Link className="button primary wide" to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
            Sign in to accept
          </Link>
        </section>
      </main>
    );
  }

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const [res] = must(await db().rpc('accept_invite', { invite_token: token })) as { club_slug: string; team_slug: string | null }[];
      await qc.invalidateQueries();
      navigate(res.team_slug ? `/${res.club_slug}/${res.team_slug}` : `/${res.club_slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const d = details.data;
  const wrongEmail = d && d.email.toLowerCase() !== (session.user.email ?? '').toLowerCase();
  return (
    <main className="auth-page">
      <section className="card auth-card">
        {details.isLoading ? (
          <Loading what="invite" />
        ) : !d ? (
          <p>This invite link isn't valid. Ask for a new one.</p>
        ) : (
          <>
            <h1>Join {d.team_name ?? d.club_name}</h1>
            <p>
              You've been invited to <b>{d.team_name ? `${d.team_name} at ${d.club_name}` : d.club_name}</b> as{' '}
              {d.role === 'admin' ? 'a club admin' : `a ${d.role}`}.
            </p>
            {d.accepted ? (
              <p className="muted">This invite has already been used.</p>
            ) : d.expired ? (
              <p className="muted">This invite has expired. Ask for a new one.</p>
            ) : wrongEmail ? (
              <p className="error-box">
                This invite was sent to {d.email}, but you're signed in as {session.user.email}. Sign out and sign in with {d.email}.
              </p>
            ) : (
              <button className="primary wide" onClick={accept} disabled={busy}>
                {busy ? 'Joining…' : 'Accept invite'}
              </button>
            )}
          </>
        )}
        <ErrorBox error={error ?? details.error} />
        <Link to="/">Go to my teams</Link>
      </section>
    </main>
  );
}
