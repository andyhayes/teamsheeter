import ExcelJS from 'exceljs';

/**
 * Reads a season workbook laid out like "Appley Bridge U13 season 26_27.xlsx" into plain rows
 * keyed by player name. Pivot sheets (Season/Player/Match Summary, Club Records) are not read;
 * the app recalculates them.
 */

export interface ParsedMatch {
  date: string;
  opponent: string;
  competition: string;
  side: 'home' | 'away' | null;
  venue: string;
  surface: string;
  goals_for: number | null;
  goals_against: number | null;
  captain: string | null;
  potm: string | null;
  report: string;
  referee: string;
  duration_minutes: number;
}

export interface ParsedStats {
  date: string;
  opponent: string;
  player: string;
  available: boolean;
  minutes: Record<string, number>;
  saves: number;
  shots: number;
  shots_on_target: number;
  assists: number;
  goals: number;
  goals_for_on_pitch: number;
  goals_against_on_pitch: number;
}

export interface ParsedSpell {
  date: string;
  opponent: string;
  players: string[];
  minutes: number;
  goals_conceded: number;
}

export interface ParsedLegacy {
  season_label: string;
  age_group: string;
  player_name: string;
  appearances: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  shots_on_target: number;
  ones_and_zeros: number | null;
}

export interface ParsedWorkbook {
  players: string[];
  matches: ParsedMatch[];
  stats: ParsedStats[];
  spells: ParsedSpell[];
  legacy: ParsedLegacy[];
}

/** Data Entry's minutes-by-position columns (H–P), after GK in G. */
const POSITION_COLUMNS: [number, string][] = [
  [7, 'GK'],
  [8, 'CB'],
  [9, 'LWB'],
  [10, 'RWB'],
  [11, 'CDM'],
  [12, 'CAM'],
  [13, 'CM'],
  [14, 'LW'],
  [15, 'RW'],
  [16, 'ST'],
];

type Raw = ExcelJS.CellValue;

/** A cell's plain value: formula results, rich text and hyperlinks unwrapped. */
function plain(v: Raw): string | number | Date | boolean | null {
  if (v == null) return null;
  if (v instanceof Date || typeof v !== 'object') return v as string | number | Date | boolean;
  if ('result' in v) return plain(v.result as Raw);
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('text' in v) return String(v.text);
  if ('error' in v) return null;
  return null;
}

const text = (v: Raw) => {
  const p = plain(v);
  return p == null ? '' : String(p).trim();
};
const num = (v: Raw) => {
  const p = plain(v);
  const n = typeof p === 'number' ? p : Number(p);
  return p == null || p === '' || Number.isNaN(n) ? 0 : n;
};
const optNum = (v: Raw) => {
  const p = plain(v);
  return p == null || p === '' || Number.isNaN(Number(p)) ? null : Number(p);
};

/** ISO date from an Excel date cell (a Date, or a serial number). */
function isoDate(v: Raw): string | null {
  const p = plain(v);
  if (p instanceof Date) return p.toISOString().slice(0, 10);
  if (typeof p === 'number' && p > 20000) return new Date(Date.UTC(1899, 11, 30) + p * 86_400_000).toISOString().slice(0, 10);
  if (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p)) return p.slice(0, 10);
  return null;
}

function rows(ws: ExcelJS.Worksheet | undefined): ExcelJS.Row[] {
  if (!ws) return [];
  const out: ExcelJS.Row[] = [];
  ws.eachRow((row, n) => n > 1 && out.push(row));
  return out;
}

export const fixtureKey = (date: string, opponent: string) => `${date}|${opponent.toLowerCase()}`;

export async function parseWorkbook(path: string, opts: { currentSeason: string }): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const players = new Set<string>();
  const addPlayer = (name: string | null) => name && players.add(name);

  const stats: ParsedStats[] = [];
  for (const r of rows(wb.getWorksheet('Data Entry'))) {
    const date = isoDate(r.getCell(1).value);
    const player = text(r.getCell(4).value);
    if (!date || !player) continue;
    addPlayer(player);
    const minutes: Record<string, number> = {};
    for (const [col, label] of POSITION_COLUMNS) {
      const m = num(r.getCell(col).value);
      if (m > 0) minutes[label] = m;
    }
    stats.push({
      date,
      opponent: text(r.getCell(2).value),
      player,
      available: num(r.getCell(5).value) > 0,
      minutes,
      saves: num(r.getCell(18).value),
      shots: num(r.getCell(19).value),
      shots_on_target: num(r.getCell(20).value),
      assists: num(r.getCell(21).value),
      goals: num(r.getCell(22).value),
      goals_for_on_pitch: num(r.getCell(24).value),
      goals_against_on_pitch: num(r.getCell(25).value),
    });
  }

  // Match length is the most minutes anyone was available for.
  const duration = new Map<string, number>();
  for (const r of rows(wb.getWorksheet('Data Entry'))) {
    const date = isoDate(r.getCell(1).value);
    if (!date) continue;
    const k = fixtureKey(date, text(r.getCell(2).value));
    duration.set(k, Math.max(duration.get(k) ?? 0, num(r.getCell(5).value)));
  }

  const matches: ParsedMatch[] = [];
  for (const r of rows(wb.getWorksheet('Match Reports'))) {
    const date = isoDate(r.getCell(1).value);
    const opponent = text(r.getCell(2).value);
    if (!date || !opponent) continue;
    const side = text(r.getCell(4).value).toLowerCase();
    const captain = text(r.getCell(10).value) || null;
    const potm = text(r.getCell(11).value) || null;
    addPlayer(captain);
    addPlayer(potm);
    matches.push({
      date,
      opponent,
      competition: text(r.getCell(3).value),
      side: side === 'home' || side === 'away' ? side : null,
      venue: text(r.getCell(5).value),
      surface: text(r.getCell(6).value),
      goals_for: optNum(r.getCell(8).value),
      goals_against: optNum(r.getCell(9).value),
      captain,
      potm,
      report: text(r.getCell(12).value),
      referee: text(r.getCell(14).value),
      duration_minutes: duration.get(fixtureKey(date, opponent)) || 60,
    });
  }

  const spells: ParsedSpell[] = [];
  for (const r of rows(wb.getWorksheet('Defence Data Entry'))) {
    const date = isoDate(r.getCell(1).value);
    const names = [3, 4, 5].map((c) => text(r.getCell(c).value)).filter(Boolean);
    if (!date || !names.length) continue;
    names.forEach(addPlayer);
    spells.push({
      date,
      opponent: text(r.getCell(2).value),
      players: names.sort(),
      minutes: num(r.getCell(7).value),
      goals_conceded: num(r.getCell(6).value),
    });
  }

  const legacy: ParsedLegacy[] = [];
  for (const r of rows(wb.getWorksheet('Previous Seasons Data'))) {
    const season = text(r.getCell(1).value);
    const name = text(r.getCell(3).value);
    // The current season's rows there are looked up from this workbook's own stats.
    if (!season || !name || season === opts.currentSeason) continue;
    legacy.push({
      season_label: season,
      age_group: text(r.getCell(2).value),
      player_name: name,
      appearances: num(r.getCell(4).value),
      goals: num(r.getCell(5).value),
      assists: num(r.getCell(6).value),
      saves: num(r.getCell(7).value),
      shots: num(r.getCell(8).value),
      shots_on_target: num(r.getCell(9).value),
      ones_and_zeros: optNum(r.getCell(10).value),
    });
  }

  return { players: [...players].sort(), matches, stats, spells, legacy };
}
