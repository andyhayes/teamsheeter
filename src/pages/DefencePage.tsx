import { useState } from 'react';
import { SortableTable } from '../components/SortableTable';
import { Empty, ErrorBox, Loading } from '../components/ui';
import type { DefenceCombo } from '../lib/db-types';
import { fmt } from '../lib/format';
import { useDefenceCombos, usePlayers } from '../lib/queries';
import { formatMinutes } from '../lib/schedule-utils';
import { useTeam } from '../lib/team-context';

/** Goals conceded by each back line (the Defence Data Entry tab, summarised). */
export function DefencePage() {
  const { season, teamId } = useTeam();
  const combos = useDefenceCombos(season?.id);
  const players = usePlayers(teamId);
  const [minMinutes, setMinMinutes] = useState(20);
  const name = (id: string) => players.data?.find((p) => p.id === id)?.name ?? '?';

  if (combos.isLoading) return <Loading />;
  const rows = (combos.data ?? []).filter((c) => Number(c.minutes) >= minMinutes);
  return (
    <main className="page narrow">
      <ErrorBox error={combos.error} />
      <div className="toolbar">
        <h1>Back lines {season?.label}</h1>
        <label className="field inline">
          <span>At least</span>
          <select value={minMinutes} onChange={(e) => setMinMinutes(Number(e.target.value))}>
            {[0, 10, 20, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} min together
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        Each played match's back lines come from its team sheet, with goals conceded from the goal log. They update automatically when a coach changes either.
      </p>
      {rows.length ? (
        <section className="card">
          <SortableTable<DefenceCombo>
            rows={rows}
            rowKey={(c) => c.player_ids.join()}
            initialSort="minutes"
            columns={[
              { key: 'who', label: 'Defenders', numeric: false, value: (c) => c.player_ids.map(name).sort().join(' · ') },
              { key: 'matches', label: 'Matches', value: (c) => c.matches },
              { key: 'minutes', label: 'Minutes', value: (c) => Number(c.minutes), render: (c) => formatMinutes(Number(c.minutes)) },
              { key: 'conceded', label: 'Conceded', value: (c) => c.goals_conceded },
              {
                key: 'rate',
                label: 'Per 60 min',
                title: 'Goals conceded per 60 minutes together (lower is better)',
                value: (c) => -(c.conceded_per_60 ?? 0),
                render: (c) => (c.conceded_per_60 == null ? '' : fmt(Number(c.conceded_per_60), 2)),
              },
            ]}
          />
        </section>
      ) : (
        <Empty>No back lines recorded{minMinutes ? ` with ${minMinutes}+ minutes together` : ''} yet.</Empty>
      )}
    </main>
  );
}
