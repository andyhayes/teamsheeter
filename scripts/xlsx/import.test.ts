import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../supabase/tests/db';
import { loadWorkbook, type Store } from './load';
import { parseWorkbook, type ParsedWorkbook } from './parse';

// The season workbook holds children's names, so it isn't committed: these tests run when it's present.
const WORKBOOK = join(import.meta.dirname, '..', '..', 'Appley Bridge U13 season 26_27.xlsx');
const run = existsSync(WORKBOOK) ? describe : describe.skip;

/** A Store over PGlite, as the database owner (the real importer uses the service-role key). */
function pgStore(db: Db): Store {
  const val = (v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);
  const cond = (w: Record<string, unknown>, offset = 0) => Object.keys(w).map((k, i) => `${k} = $${i + 1 + offset}`).join(' and ') || 'true';
  const insertSql = (table: string, rows: Record<string, unknown>[]) => {
    const cols = Object.keys(rows[0]);
    const params: unknown[] = [];
    const tuples = rows.map((r) => `(${cols.map((c) => (params.push(val(r[c])), `$${params.length}`)).join(', ')})`);
    return { sql: `insert into ${table} (${cols.join(', ')}) values ${tuples.join(', ')}`, params, cols };
  };
  return {
    select: async (t, w) => (await db.query(`select * from ${t} where ${cond(w)}`, Object.values(w))).rows as Record<string, unknown>[],
    insert: async (t, rows) => {
      const { sql, params } = insertSql(t, rows);
      return (await db.query(`${sql} returning *`, params)).rows as Record<string, unknown>[];
    },
    upsert: async (t, rows, onConflict) => {
      const { sql, params, cols } = insertSql(t, rows);
      const keys = onConflict.split(',');
      const set = cols.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`);
      await db.query(`${sql} on conflict (${onConflict}) do ${set.length ? `update set ${set.join(', ')}` : 'nothing'}`, params);
    },
    update: async (t, w, patch) => {
      const p = Object.keys(patch);
      await db.query(`update ${t} set ${p.map((k, i) => `${k} = $${i + 1}`).join(', ')} where ${cond(w, p.length)}`, [...Object.values(patch).map(val), ...Object.values(w)]);
    },
    delete: async (t, w) => void (await db.query(`delete from ${t} where ${cond(w)}`, Object.values(w))),
  };
}

run('importing the 2026/27 workbook', () => {
  let db: Db;
  let parsed: ParsedWorkbook;
  let teamId: string;
  let seasonId: string;

  beforeAll(async () => {
    db = await createDb();
    parsed = await parseWorkbook(WORKBOOK, { currentSeason: '2026/27' });
    const club = (await db.query<{ id: string }>(`insert into clubs (name, slug) values ('Appley Bridge', 'appley-bridge') returning id`)).rows[0];
    teamId = (await db.query<{ id: string }>(`insert into teams (club_id, name, slug) values ($1, '2014s', 'u13') returning id`, [club.id])).rows[0].id;
    seasonId = (await db.query<{ id: string }>(`insert into seasons (team_id, label, age_group) values ($1, '2026/27', 'U13') returning id`, [teamId])).rows[0].id;
  }, 60_000);

  it('loads every sheet, and re-running changes nothing', async () => {
    const opts = { teamId, seasonId, aliases: { 'George A': 'George' } };
    const first = await loadWorkbook(pgStore(db), parsed, opts);
    expect(first).toMatchObject({ playersCreated: 13, matches: 6, stats: 78, spells: 14 });
    const second = await loadWorkbook(pgStore(db), parsed, opts);
    expect(second).toMatchObject({ playersCreated: 0, matches: 6, stats: 78, spells: 14 });
    const counts = await db.query<{ n: number }>(`select (select count(*) from matches)::int + (select count(*) from match_player_stats)::int * 100 as n`);
    expect(counts.rows[0].n).toBe(6 + 78 * 100);
  });

  it("reproduces the workbook's Season Summary pivot for the Vulcan match", async () => {
    // Season Summary rows 17–27, filtered to Vulcan Football Club Rovers (columns B–Q).
    const pivot: Record<string, number[]> = {
      //          avail outf gk  CB LWB RWB CDM CAM ST capt sav sh sot ast gls potm
      Alex:       [60, 45, 0, 0, 12, 0, 0, 33, 0, 0, 0, 1, 1, 0, 1, 0],
      Blake:      [60, 48, 0, 48, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      Ethan:      [60, 48, 0, 0, 0, 0, 0, 0, 48, 0, 0, 4, 2, 0, 2, 0],
      George:     [60, 51, 0, 0, 12, 0, 0, 39, 0, 0, 0, 2, 1, 1, 1, 1],
      Jax:        [60, 48, 0, 42, 0, 0, 0, 0, 6, 0, 0, 2, 0, 0, 0, 0],
      Lucas:      [60, 0, 60, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0],
      Peter:      [60, 48, 0, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      Theo:       [60, 48, 0, 0, 0, 0, 0, 48, 0, 0, 0, 2, 1, 0, 0, 0],
      'Thomas L': [60, 48, 0, 0, 36, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      'Thomas W': [60, 48, 0, 30, 0, 0, 12, 0, 6, 0, 0, 2, 0, 1, 0, 0],
      Will:       [60, 48, 0, 0, 0, 48, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0],
    };
    const { rows } = await db.query<Record<string, unknown>>(
      `select p.name, v.* from v_player_match v join players p on p.id = v.player_id
       where v.opponent = 'Vulcan Football Club Rovers' and v.available`,
    );
    const got = Object.fromEntries(
      rows.map((r) => {
        const pos = r.minutes_by_position as Record<string, number>;
        const n = (k: string) => Number(r[k]);
        return [
          r.name,
          [n('available_minutes'), n('outfield_minutes'), n('gk_minutes'), ...['CB', 'LWB', 'RWB', 'CDM', 'CAM', 'ST'].map((k) => pos[k] ?? 0),
            r.captain ? 1 : 0, n('saves'), n('shots'), n('shots_on_target'), n('assists'), n('goals'), r.potm ? 1 : 0],
        ];
      }),
    );
    expect(got).toEqual(pivot);
  });

  it('totals the season: 6 played, W3 L3, 16–16', async () => {
    const { rows } = await db.query(`select played, won, drawn, lost, goals_for, goals_against from v_season_summary`);
    expect(rows[0]).toEqual({ played: 6, won: 3, drawn: 0, lost: 3, goals_for: 16, goals_against: 16 });
  });

  it('keeps earlier seasons out of the current one, linking names and aliases to players', async () => {
    const { rows } = await db.query<{ season_label: string; legacy: boolean; n: number }>(
      `select season_label, legacy, count(*)::int as n from v_player_seasons_all group by 1, 2 order by 1`,
    );
    expect(rows.map((r) => r.season_label)).toEqual(['2021/22', '2022/23', '2023/24', '2024/25', '2025/26', '2026/27']);
    expect(rows.find((r) => r.season_label === '2026/27')).toMatchObject({ legacy: false });
    const george = await db.query(`select count(*)::int as n from legacy_season_totals l join players p on p.id = l.player_id where p.name = 'George'`);
    expect((george.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});
