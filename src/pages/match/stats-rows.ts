import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readDraft, useAutosave } from '../../lib/autosave';
import type { DefenceSpell, Match, PlayerStatsRow } from '../../lib/db-types';
import { defenceSpells, statsFromSheet } from '../../lib/match-stats';
import { FORMATIONS } from '../../lib/presets';
import { flattenPeriods } from '../../lib/schedule-utils';
import { db, must } from '../../lib/supabase';
import { useDefenceSpells, useMatchGoals, useMatchStats, useTeamSheet, type SquadPlayer } from '../../lib/queries';
import { useTeam } from '../../lib/team-context';

export type Counter = 'saves' | 'shots' | 'shots_on_target' | 'assists' | 'goals';
export const COUNTERS: [Counter, string][] = [
  ['saves', 'Saves'],
  ['shots', 'Shots'],
  ['shots_on_target', 'On target'],
  ['assists', 'Assists'],
  ['goals', 'Goals'],
];

export const blankRow = (match: Match, playerId: string): PlayerStatsRow => ({
  match_id: match.id,
  player_id: playerId,
  team_id: match.team_id,
  available: false,
  minutes: {},
  saves: 0,
  shots: 0,
  shots_on_target: 0,
  assists: 0,
  goals: 0,
  goals_for_on_pitch: 0,
  goals_against_on_pitch: 0,
});

export const totalMinutes = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

/** Fields worked out from the team sheet and goal log rather than counted by hand. */
type Derived = Pick<PlayerStatsRow, 'available' | 'minutes' | 'goals_for_on_pitch' | 'goals_against_on_pitch'>;
// Minutes keys sorted, as the database may return them in a different order.
const derivedOf = (r: Derived): Derived => ({
  available: r.available,
  minutes: Object.fromEntries(Object.entries(r.minutes).filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b))),
  goals_for_on_pitch: r.goals_for_on_pitch,
  goals_against_on_pitch: r.goals_against_on_pitch,
});
const spellKey = (s: Pick<DefenceSpell, 'player_ids' | 'minutes' | 'goals_conceded'>[]) =>
  JSON.stringify(s.map((x) => [[...x.player_ids].sort(), x.minutes, x.goals_conceded]).sort());

/**
 * A match's per-player stats as editable rows that autosave, one row per squad player plus anyone
 * with saved stats who has since left the squad. Shared by the team sheet view and the Stats tab.
 * Unsaved edits from a previous screen (kept as a local draft) are picked up and saved.
 *
 * When the match has a team sheet, availability, minutes by position, on-pitch goals and back lines
 * always come from the sheet and the goal log: `view` shows them for everyone, and for coaches they
 * are saved as they change so season totals stay right. Matches without a sheet (e.g. imported)
 * keep their saved values. Hand counts (saves, shots, on target, assists, goals) are never touched.
 */
export function useStatsRows(match: Match, squad: SquadPlayer[]) {
  const { canEdit } = useTeam();
  const stats = useMatchStats(match.id);
  const qc = useQueryClient();
  const draftKey = `teamsheeter:draft:stats:${match.id}`;

  const players = useMemo(() => {
    const ids = new Set(squad.map((p) => p.id));
    const extra = (stats.data ?? []).filter((r) => !ids.has(r.player_id)).map((r) => ({ id: r.player_id, name: 'Former player' }));
    return [...squad.map((p) => ({ id: p.id, name: p.name })), ...extra];
  }, [squad, stats.data]);

  const [rows, setRows] = useState<PlayerStatsRow[] | null>(null);
  const [baseline, setBaseline] = useState<PlayerStatsRow[] | null>(null);
  if (stats.data && rows === null) {
    const byId = new Map(stats.data.map((r) => [r.player_id, r]));
    const fromServer = players.map((p) => byId.get(p.id) ?? blankRow(match, p.id));
    const draft = canEdit ? readDraft<PlayerStatsRow[]>(draftKey)?.value : null;
    const draftById = new Map((draft ?? []).map((r) => [r.player_id, r]));
    setRows(fromServer.map((r) => draftById.get(r.player_id) ?? r));
    setBaseline(fromServer);
  }

  const save = useCallback(
    async (value: PlayerStatsRow[]) => {
      // Only rows that say something: available players and anyone with numbers.
      const meaningful = value.filter((r) => r.available || totalMinutes(r.minutes) > 0 || COUNTERS.some(([k]) => r[k] > 0));
      if (meaningful.length) must(await db().from('match_player_stats').upsert(meaningful, { onConflict: 'match_id,player_id' }));
      const empty = value.filter((r) => !meaningful.includes(r)).map((r) => r.player_id);
      if (empty.length) must(await db().from('match_player_stats').delete().eq('match_id', match.id).in('player_id', empty));
      qc.setQueryData(['stats', match.id], meaningful);
      for (const k of ['seasonTotals', 'seasonPlayerMatches']) qc.invalidateQueries({ queryKey: [k, match.season_id] });
    },
    [match.id, match.season_id, qc],
  );
  const { status, error } = useAutosave(canEdit ? rows : null, baseline, save, draftKey);

  // Work out the sheet-based fields.
  const sheet = useTeamSheet(match.id);
  const goals = useMatchGoals(match.id);
  const storedSpells = useDefenceSpells(match.id);
  const fromSheet = useMemo(() => {
    const s = sheet.data;
    const formation = FORMATIONS.find((f) => f.id === s?.formation_id);
    if (!s?.schedule || !formation || !goals.data || !rows) return null;
    const periods = flattenPeriods(s.halves);
    const drafts = statsFromSheet(rows.map((r) => r.player_id), s.available, s.schedule, formation.slots, periods, goals.data);
    return {
      byPlayer: new Map(drafts.map((d) => [d.player_id, derivedOf(d)])),
      spells: defenceSpells(s.schedule, formation.slots, periods, goals.data),
    };
  }, [sheet.data, goals.data, rows]);

  const view = useMemo(
    () => rows && (fromSheet ? rows.map((r) => ({ ...r, ...fromSheet.byPlayer.get(r.player_id) })) : rows),
    [rows, fromSheet],
  );
  const spells = fromSheet ? fromSheet.spells : (storedSpells.data ?? []);

  // Coaches: save the sheet-based fields through the same autosave as the hand counts.
  useEffect(() => {
    if (!canEdit || !fromSheet || !rows) return;
    const stale = rows.some((r) => {
      const d = fromSheet.byPlayer.get(r.player_id);
      return d && JSON.stringify(derivedOf(r)) !== JSON.stringify(d);
    });
    if (stale) setRows((rs) => rs && rs.map((r) => ({ ...r, ...fromSheet.byPlayer.get(r.player_id) })));
  }, [canEdit, fromSheet, rows]);

  // Coaches: replace the saved back lines when they no longer match the sheet.
  const spellsSaving = useRef<string | null>(null);
  useEffect(() => {
    if (!canEdit || !fromSheet || !storedSpells.data) return;
    const want = spellKey(fromSheet.spells);
    if (want === spellKey(storedSpells.data) || spellsSaving.current === want) return;
    spellsSaving.current = want;
    (async () => {
      must(await db().from('defence_spells').delete().eq('match_id', match.id));
      if (fromSheet.spells.length) {
        must(await db().from('defence_spells').insert(fromSheet.spells.map((c) => ({ ...c, match_id: match.id, team_id: match.team_id }))));
      }
    })()
      .catch((e) => console.error('Saving back lines failed', e))
      .finally(() => {
        spellsSaving.current = null;
        qc.invalidateQueries({ queryKey: ['spells', match.id] });
        qc.invalidateQueries({ queryKey: ['combos', match.season_id] });
      });
  }, [canEdit, fromSheet, storedSpells.data, match.id, match.team_id, match.season_id, qc]);

  const update = useCallback(
    (playerId: string, patch: Partial<PlayerStatsRow>) => setRows((rs) => rs && rs.map((r) => (r.player_id === playerId ? { ...r, ...patch } : r))),
    [],
  );

  return {
    players,
    rows,
    /** Rows as they should read: with the team sheet's minutes and on-pitch goals when there is one. */
    view,
    /** Back lines: from the team sheet when there is one, otherwise as saved. */
    spells,
    hasSheet: !!fromSheet,
    goals: goals.data ?? [],
    setRows,
    update,
    status,
    saveError: error,
    isLoading: stats.isLoading || goals.isLoading || sheet.isLoading,
    error: stats.error ?? goals.error ?? sheet.error ?? storedSpells.error,
  };
}
