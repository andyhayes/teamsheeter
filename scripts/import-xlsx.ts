/**
 * Import a season workbook into a team's season.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/import-xlsx.ts \
 *     --club appley-bridge --team u13 --season 2026/27 --age U13 \
 *     [--alias "George A=George"] [--dry-run] "Appley Bridge U13 season 26_27.xlsx"
 *
 * The club and team must already exist (create them in the app). The season is created if needed.
 * Uses the service-role key, which bypasses row-level security: keep it out of the browser and git.
 */
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { parseWorkbook } from './xlsx/parse';
import { loadWorkbook, type Store } from './xlsx/load';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    club: { type: 'string' },
    team: { type: 'string' },
    season: { type: 'string' },
    age: { type: 'string', default: '' },
    format: { type: 'string', default: '9v9' },
    alias: { type: 'string', multiple: true, default: [] },
    'dry-run': { type: 'boolean', default: false },
  },
});

const file = positionals[0];
if (!file || !values.club || !values.team || !values.season) {
  console.error('Usage: import-xlsx.ts --club <slug> --team <slug> --season 2026/27 [--age U13] [--alias "Old=New"] [--dry-run] <file.xlsx>');
  process.exit(1);
}

const parsed = await parseWorkbook(file, { currentSeason: values.season });
console.log(
  `Read ${parsed.matches.length} matches, ${parsed.stats.length} player-match rows, ${parsed.spells.length} back-line rows, ` +
    `${parsed.legacy.length} earlier-season rows and ${parsed.players.length} players: ${parsed.players.join(', ')}`,
);
if (values['dry-run']) process.exit(0);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

type Result = PromiseLike<{ data: unknown; error: { message: string } | null }>;
async function must<T = unknown>(p: Result): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

/** Add .eq() filters for each key. Loosely typed: tables here are chosen at runtime. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const where = (q: any, w: Record<string, unknown>): Result => Object.entries(w).reduce((acc, [k, v]) => acc.eq(k, v), q);

const store: Store = {
  select: (table, w) => must(where(supabase.from(table).select('*'), w)),
  insert: (table, rows) => must(supabase.from(table).insert(rows).select()),
  upsert: async (table, rows, onConflict) => void (await must(supabase.from(table).upsert(rows, { onConflict }))),
  update: async (table, w, patch) => void (await must(where(supabase.from(table).update(patch), w))),
  delete: async (table, w) => void (await must(where(supabase.from(table).delete(), w))),
};

const club = await must<{ id: string }>(supabase.from('clubs').select('id').eq('slug', values.club).single());
const team = await must<{ id: string }>(supabase.from('teams').select('id').eq('club_id', club.id).eq('slug', values.team).single());
const teamId = team.id;
let season = await must<{ id: string } | null>(supabase.from('seasons').select('id').eq('team_id', teamId).eq('label', values.season).maybeSingle());
if (!season) {
  season = await must<{ id: string }>(
    supabase.from('seasons').insert({ team_id: teamId, label: values.season, age_group: values.age, format: values.format }).select('id').single(),
  );
  console.log(`Created season ${values.season}`);
}

const aliases = Object.fromEntries(values.alias!.map((a) => a.split('=').map((s) => s.trim()) as [string, string]));
const result = await loadWorkbook(store, parsed, { teamId, seasonId: season.id, aliases });
console.log('Imported:', result);
