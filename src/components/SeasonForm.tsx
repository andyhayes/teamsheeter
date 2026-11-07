import { useState, type ChangeEvent, type ReactNode } from 'react';
import type { Season } from '../lib/db-types';
import { db, must } from '../lib/supabase';
import { ErrorBox } from './ui';

export type SeasonFields = Pick<Season, 'label' | 'age_group' | 'format'>;

const FORMATS = ['5v5', '7v7', '9v9', '11v11'];

/** Label, age group and format, for adding or editing a season. */
export function SeasonForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: {
  initial: SeasonFields;
  submitLabel: string;
  onSubmit: (fields: SeasonFields) => Promise<unknown>;
  onCancel?: () => void;
  /** Extra fields shown under the main ones. */
  children?: ReactNode;
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof SeasonFields) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    const fields = {
      label: f.label.trim(),
      age_group: f.age_group.trim(),
      format: f.format.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      await onSubmit(fields);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('duplicate key') ? `There's already a ${fields.label} season.` : msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="season-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="field-row three">
        <label className="field">
          <span>Season</span>
          <input value={f.label} onChange={set('label')} placeholder="2026/27" />
        </label>
        <label className="field">
          <span>Age group</span>
          <input value={f.age_group} onChange={set('age_group')} placeholder="U13" />
        </label>
        <label className="field">
          <span>Format</span>
          <input value={f.format} onChange={set('format')} list="season-formats" placeholder="9v9" />
          <datalist id="season-formats">
            {FORMATS.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
      </div>
      {children}
      <div className="row-actions">
        <button className="primary" disabled={busy || !f.label.trim()}>
          {busy ? '…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <ErrorBox error={error} />
    </form>
  );
}

/** Copy one season's squad (in the same order) into another. */
export async function copySquad(fromSeasonId: string, toSeasonId: string, teamId: string) {
  const squad = must(await db().from('season_squads').select('player_id, sort_order, shirt_no').eq('season_id', fromSeasonId)) as {
    player_id: string;
    sort_order: number;
    shirt_no: number | null;
  }[];
  if (squad.length)
    must(
      await db()
        .from('season_squads')
        .insert(squad.map((s) => ({ ...s, season_id: toSeasonId, team_id: teamId }))),
    );
}
