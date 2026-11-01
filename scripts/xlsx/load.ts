import { fixtureKey, type ParsedWorkbook } from './parse';

type Row = Record<string, unknown>;

/** The few database operations the loader needs, so it can run against Supabase or a test database. */
export interface Store {
  select(table: string, where: Row): Promise<Row[]>;
  insert(table: string, rows: Row[]): Promise<Row[]>;
  upsert(table: string, rows: Row[], onConflict: string): Promise<void>;
  update(table: string, where: Row, patch: Row): Promise<void>;
  delete(table: string, where: Row): Promise<void>;
}

export interface LoadOptions {
  teamId: string;
  seasonId: string;
  /** Earlier-season names that are the same person as a current player, e.g. {"George A": "George"}. */
  aliases?: Record<string, string>;
}

export interface LoadResult {
  playersCreated: number;
  matches: number;
  stats: number;
  spells: number;
  legacy: number;
  legacyLinked: number;
}

/**
 * Write a parsed workbook into a team's season. Safe to re-run: players are matched by name,
 * matches by date and opponent, and each match's stats and back lines are replaced.
 */
export async function loadWorkbook(store: Store, wb: ParsedWorkbook, { teamId, seasonId, aliases = {} }: LoadOptions): Promise<LoadResult> {
  // Players, matched to existing ones by name (case-insensitive).
  const existing = (await store.select('players', { team_id: teamId })) as { id: string; name: string }[];
  const idByName = new Map(existing.map((p) => [p.name.toLowerCase(), p.id]));
  const missing = wb.players.filter((n) => !idByName.has(n.toLowerCase()));
  if (missing.length) {
    const created = (await store.insert('players', missing.map((name) => ({ team_id: teamId, name })))) as { id: string; name: string }[];
    for (const p of created) idByName.set(p.name.toLowerCase(), p.id);
  }
  const pid = (name: string | null) => (name ? idByName.get(name.toLowerCase()) ?? null : null);

  await store.upsert(
    'season_squads',
    wb.players.map((name, i) => ({ season_id: seasonId, player_id: pid(name), team_id: teamId, sort_order: i })),
    'season_id,player_id',
  );

  // Matches, matched by date and opponent.
  const current = (await store.select('matches', { season_id: seasonId })) as { id: string; date: string | Date; opponent: string }[];
  // Some drivers return dates as Date objects (at UTC midnight), the API as 'YYYY-MM-DD'.
  const isoOf = (d: string | Date) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
  const matchId = new Map(current.map((m) => [fixtureKey(isoOf(m.date), m.opponent), m.id]));
  for (const m of wb.matches) {
    const fields = {
      team_id: teamId,
      season_id: seasonId,
      date: m.date,
      opponent: m.opponent,
      competition: m.competition,
      side: m.side,
      venue: m.venue,
      surface: m.surface,
      duration_minutes: m.duration_minutes,
      goals_for: m.goals_for,
      goals_against: m.goals_against,
      captain_id: pid(m.captain),
      potm_id: pid(m.potm),
      report: m.report,
      referee: m.referee,
      status: m.goals_for != null && m.goals_against != null ? 'played' : 'fixture',
    };
    const key = fixtureKey(m.date, m.opponent);
    const id = matchId.get(key);
    if (id) await store.update('matches', { id }, fields);
    else matchId.set(key, ((await store.insert('matches', [fields])) as { id: string }[])[0].id);
  }

  // Per-player stats and back lines, replaced match by match.
  let statCount = 0;
  let spellCount = 0;
  for (const m of wb.matches) {
    const id = matchId.get(fixtureKey(m.date, m.opponent))!;
    const key = fixtureKey(m.date, m.opponent);
    const stats = wb.stats.filter((s) => fixtureKey(s.date, s.opponent) === key);
    await store.delete('match_player_stats', { match_id: id });
    if (stats.length) {
      await store.insert(
        'match_player_stats',
        stats.map((s) => ({
          match_id: id,
          player_id: pid(s.player),
          team_id: teamId,
          available: s.available,
          minutes: s.minutes,
          saves: s.saves,
          shots: s.shots,
          shots_on_target: s.shots_on_target,
          assists: s.assists,
          goals: s.goals,
          goals_for_on_pitch: s.goals_for_on_pitch,
          goals_against_on_pitch: s.goals_against_on_pitch,
        })),
      );
    }
    statCount += stats.length;
    const spells = wb.spells.filter((s) => fixtureKey(s.date, s.opponent) === key);
    await store.delete('defence_spells', { match_id: id });
    if (spells.length) {
      await store.insert(
        'defence_spells',
        spells.map((s) => ({ match_id: id, team_id: teamId, player_ids: s.players.map(pid).sort(), minutes: s.minutes, goals_conceded: s.goals_conceded })),
      );
    }
    spellCount += spells.length;
  }

  // Earlier seasons, linked to current players by name or alias.
  let linked = 0;
  if (wb.legacy.length) {
    await store.upsert(
      'legacy_season_totals',
      wb.legacy.map((l) => {
        const player_id = pid(aliases[l.player_name] ?? l.player_name);
        if (player_id) linked++;
        return { team_id: teamId, ...l, player_id };
      }),
      'team_id,season_label,player_name',
    );
  }

  return { playersCreated: missing.length, matches: wb.matches.length, stats: statCount, spells: spellCount, legacy: wb.legacy.length, legacyLinked: linked };
}
