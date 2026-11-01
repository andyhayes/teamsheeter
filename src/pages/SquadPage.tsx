import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SquadPanel } from '../components/SquadPanel';
import { ActionButton, Empty, ErrorBox, Loading, SaveIndicator } from '../components/ui';
import { useAutosave } from '../lib/autosave';
import { loadState } from '../lib/storage';
import { db, must } from '../lib/supabase';
import { usePlayers, useSquad, type SquadPlayer } from '../lib/queries';
import { useTeam } from '../lib/team-context';
import type { Player } from '../lib/types';

const toPlayers = (squad: SquadPlayer[]): Player[] => squad.map((p) => ({ id: p.id, name: p.name, positions: p.positions }));

/** Squad names from the old browser-only Teamsheeter, if this browser has any (not the demo names). */
function localSquadNames(): { name: string; positions: string[] }[] {
  try {
    if (!localStorage.getItem('teamsheeter:v1')) return [];
  } catch {
    return [];
  }
  return loadState().squad.filter((p) => !/^Player \d+$/.test(p.name)).map(({ name, positions }) => ({ name, positions }));
}

export function SquadPage() {
  const { season, teamId, canEdit, path } = useTeam();
  const squad = useSquad(season?.id);
  const allPlayers = usePlayers(teamId);
  const qc = useQueryClient();
  const [list, setList] = useState<Player[] | null>(null);
  const [baseline, setBaseline] = useState<Player[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const saved = useRef<Player[]>([]);

  // Load the squad once per season. Done during render (not in an effect) so cached data shows at once.
  if (squad.data && season && loadedFor !== season.id) {
    const players = toPlayers(squad.data);
    saved.current = players;
    setLoadedFor(season.id);
    setList(players);
    setBaseline(players);
  }

  const save = useCallback(
    async (next: Player[]) => {
      const prev = saved.current;
      const prevById = new Map(prev.map((p) => [p.id, p]));
      const known = new Set((allPlayers.data ?? []).map((p) => p.id));
      const nextIds = new Set(next.map((p) => p.id));
      const client = db();

      const created = next.filter((p) => !prevById.has(p.id) && !known.has(p.id));
      if (created.length) {
        must(await client.from('players').insert(created.map((p) => ({ id: p.id, team_id: teamId, name: p.name.trim() || 'New player', positions: p.positions }))));
      }
      const changed = next.filter((p) => {
        const old = prevById.get(p.id);
        return old && (old.name !== p.name || old.positions.join() !== p.positions.join());
      });
      for (const p of changed) must(await client.from('players').update({ name: p.name.trim() || 'Unnamed', positions: p.positions }).eq('id', p.id));

      const removed = prev.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
      if (removed.length) must(await client.from('season_squads').delete().eq('season_id', season!.id).in('player_id', removed));
      // Season positions now live on the player, so clear any per-season override.
      must(
        await client.from('season_squads').upsert(
          next.map((p, i) => ({ season_id: season!.id, player_id: p.id, team_id: teamId, sort_order: i, positions: null })),
          { onConflict: 'season_id,player_id' },
        ),
      );
      saved.current = next;
      qc.invalidateQueries({ queryKey: ['squad', season!.id] });
      if (created.length || changed.length) qc.invalidateQueries({ queryKey: ['players', teamId] });
    },
    [allPlayers.data, teamId, season, qc],
  );
  const { status, error } = useAutosave(canEdit ? list : null, baseline, save, `teamsheeter:draft:squad:${season?.id}`);

  if (squad.error) return <main className="page"><ErrorBox error={squad.error} /></main>;
  if (!list || loadedFor !== season?.id) return <Loading what="squad" />;

  if (!canEdit) {
    return (
      <main className="page narrow">
        <section className="card">
          <h2>Squad {season?.label}</h2>
          <ul className="link-list">
            {list.map((p) => (
              <li key={p.id}>
                <Link to={path(`players/${p.id}`)}>{p.name}</Link>
                <span className="muted small">{p.positions.join(' ')}</span>
              </li>
            ))}
          </ul>
          {!list.length && <Empty>No players in the squad yet.</Empty>}
        </section>
      </main>
    );
  }

  const inSquad = new Set(list.map((p) => p.id));
  const former = (allPlayers.data ?? []).filter((p) => !inSquad.has(p.id));
  const local = localSquadNames().filter((l) => !list.some((p) => p.name.toLowerCase() === l.name.toLowerCase()));

  return (
    <main className="page">
      <ErrorBox error={squad.error ?? allPlayers.error} />
      <div className="squad-toolbar">
        <SaveIndicator status={status} error={error} />
      </div>
      <SquadPanel squad={list} onChange={setList} />
      {former.length > 0 && (
        <section className="card squad-panel">
          <h2>Players from earlier seasons</h2>
          <p className="muted small">Add them back to this season's squad. Their stats history is kept either way.</p>
          <div className="chips">
            {former.map((p) => (
              <button key={p.id} className="chip" onClick={() => setList((l) => [...(l ?? []), { id: p.id, name: p.name, positions: p.positions }])}>
                + {p.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {local.length > 0 && (
        <section className="card squad-panel">
          <h2>Import from this browser</h2>
          <p className="muted small">
            This browser has a squad from the earlier, local-only Teamsheeter: {local.map((l) => l.name).join(', ')}.
          </p>
          <ActionButton
            onClick={async () => setList((l) => [...(l ?? []), ...local.map((p) => ({ id: crypto.randomUUID(), ...p }))])}
          >
            Add {local.length} players with their positions
          </ActionButton>
        </section>
      )}
    </main>
  );
}
