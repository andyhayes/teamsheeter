import type { Match, PlayerMatchRow, PlayerSeasonAll } from './db-types';

export interface RecordEntry {
  title: string;
  value: string;
  /** Who/what holds it, e.g. "Ethan · 2026/27" or "vs Cherrybrook Robins, 6–1". */
  holders: string[];
}

type Scored = Pick<Match, 'date' | 'opponent' | 'goals_for' | 'goals_against'> & { teamName?: string };

const withScore = (ms: Scored[]) => ms.filter((m) => m.goals_for != null && m.goals_against != null) as (Scored & { goals_for: number; goals_against: number })[];
const describe = (m: Scored & { goals_for: number; goals_against: number }) =>
  `${m.teamName ? `${m.teamName} ` : ''}vs ${m.opponent || 'TBC'}, ${m.goals_for}–${m.goals_against} (${m.date})`;

/** The top value and everyone tied on it (up to 3 shown), or null if nothing scores above zero. */
function best<T>(items: T[], score: (t: T) => number, label: (t: T) => string, max = 3): { value: number; holders: string[] } | null {
  let top = 0;
  for (const t of items) top = Math.max(top, score(t));
  if (top <= 0) return null;
  const holders = items.filter((t) => score(t) === top).map(label);
  return { value: top, holders: holders.length > max ? [...holders.slice(0, max), `+${holders.length - max} more`] : holders };
}

function longestRun(ms: (Scored & { goals_for: number; goals_against: number })[], ok: (m: { goals_for: number; goals_against: number }) => boolean) {
  const sorted = [...ms].sort((a, b) => a.date.localeCompare(b.date));
  let bestRun = 0;
  let run = 0;
  for (const m of sorted) {
    run = ok(m) ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }
  return bestRun;
}

/** Team records from played matches. */
export function matchRecords(matches: Scored[]): RecordEntry[] {
  const ms = withScore(matches);
  const out: RecordEntry[] = [];
  const add = (title: string, r: { value: number; holders: string[] } | null, fmt = (v: number) => String(v)) => {
    if (r) out.push({ title, value: fmt(r.value), holders: r.holders });
  };
  add('Biggest win', best(ms, (m) => m.goals_for - m.goals_against, describe), (v) => `+${v}`);
  add('Heaviest defeat', best(ms, (m) => m.goals_against - m.goals_for, describe), (v) => `−${v}`);
  add('Most goals scored in a match', best(ms, (m) => m.goals_for, describe));
  add('Highest-scoring match', best(ms, (m) => m.goals_for + m.goals_against, describe));
  const runs: [string, (m: { goals_for: number; goals_against: number }) => boolean][] = [
    ['Longest winning run', (m) => m.goals_for > m.goals_against],
    ['Longest unbeaten run', (m) => m.goals_for >= m.goals_against],
    ['Most clean sheets in a row', (m) => m.goals_against === 0],
  ];
  for (const [title, ok] of runs) {
    const n = longestRun(ms, ok);
    if (n > 1) out.push({ title, value: `${n} matches`, holders: [] });
  }
  return out;
}

type SeasonRow = Pick<PlayerSeasonAll, 'season_label' | 'player_id' | 'player_name' | 'appearances' | 'goals' | 'assists' | 'saves'>;
const STATS = [
  ['goals', 'goals'],
  ['assists', 'assists'],
  ['saves', 'saves'],
  ['appearances', 'appearances'],
] as const;

/** Best single seasons and all-time totals, from app seasons plus pre-app season totals. */
export function playerRecords(seasons: SeasonRow[], matchRows: Pick<PlayerMatchRow, 'player_id' | 'goals' | 'saves' | 'date' | 'opponent'>[], nameOf: (id: string) => string): RecordEntry[] {
  const out: RecordEntry[] = [];
  for (const [key, word] of STATS) {
    const r = best(seasons, (s) => s[key], (s) => `${s.player_name} · ${s.season_label}`);
    if (r) out.push({ title: `Most ${word} in a season`, value: String(r.value), holders: r.holders });
  }
  // All-time totals per player: by id, or for unlinked pre-app rows, by a linked row's name.
  const idByName = new Map(seasons.filter((s) => s.player_id).map((s) => [s.player_name.toLowerCase(), s.player_id!]));
  const totals = new Map<string, { name: string } & Record<(typeof STATS)[number][0], number>>();
  for (const s of seasons) {
    const k = s.player_id ?? idByName.get(s.player_name.toLowerCase()) ?? `name:${s.player_name.toLowerCase()}`;
    const t = totals.get(k) ?? { name: s.player_name, goals: 0, assists: 0, saves: 0, appearances: 0 };
    for (const [key] of STATS) t[key] += s[key];
    totals.set(k, t);
  }
  for (const [key, word] of STATS) {
    const r = best([...totals.values()], (t) => t[key], (t) => t.name);
    if (r) out.push({ title: `Most ${word} (all time)`, value: String(r.value), holders: r.holders });
  }
  for (const [key, word] of [['goals', 'goals'], ['saves', 'saves']] as const) {
    const r = best(matchRows, (m) => m[key], (m) => `${nameOf(m.player_id)} vs ${m.opponent || 'TBC'} (${m.date})`);
    if (r) out.push({ title: `Most ${word} in a match`, value: String(r.value), holders: r.holders });
  }
  return out;
}
