import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ErrorBox } from '../components/ui';
import { slugify } from '../lib/format';
import { db, must } from '../lib/supabase';

export function CreateClubPage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const finalSlug = slugEdited ? slug : slugify(name);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const club = must(await db().rpc('create_club', { club_name: name.trim(), club_slug: finalSlug })) as { slug: string };
      await qc.invalidateQueries();
      navigate(`/${club.slug}`);
    } catch (e) {
      setError(/duplicate|unique/i.test(String(e)) ? new Error('That web address is taken. Choose another.') : e);
      setBusy(false);
    }
  };

  return (
    <Shell>
      <main className="page narrow">
        <h1>Set up a club</h1>
        <p className="muted">You'll be the club admin: you can add teams and invite coaches. You won't see a team's data unless you join it too.</p>
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <label className="field">
            <span>Club name</span>
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Appley Bridge FC" />
          </label>
          <label className="field">
            <span>Web address</span>
            <div className="input-prefix">
              <span>{window.location.host}/</span>
              <input
                value={finalSlug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </div>
          </label>
          <button className="primary" disabled={busy || !name.trim() || !finalSlug}>
            {busy ? 'Creating…' : 'Create club'}
          </button>
          <ErrorBox error={error} />
        </form>
      </main>
    </Shell>
  );
}
