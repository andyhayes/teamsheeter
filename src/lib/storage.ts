import { DEMO_SQUAD, FORMATIONS, PERIOD_PRESETS } from './presets';
import type { Fixture, Locks, Player, Schedule } from './types';

export interface AppState {
  squad: Player[];
  fixture: Fixture;
  schedule: Schedule | null;
  /** Inputs the current schedule was generated from; a mismatch triggers regeneration. */
  scheduleKey: string;
  locks: Locks;
  seed: number;
}

const STORAGE_KEY = 'teamsheeter:v1';

export const newId = () => Math.random().toString(36).slice(2, 10);

export function defaultState(): AppState {
  const squad = DEMO_SQUAD.map((p) => ({ ...p, id: newId() }));
  const available = squad.slice(0, 12).map((p) => p.id);
  return {
    squad,
    fixture: {
      date: new Date().toISOString().slice(0, 10),
      teamName: '',
      opponent: '',
      venue: '',
      formationId: FORMATIONS[0].id,
      halves: PERIOD_PRESETS.find((p) => p.id === '12-6-12-666')!.halves,
      available,
      keepers: [squad[0].id, squad[0].id],
    },
    schedule: null,
    scheduleKey: '',
    locks: {},
    seed: 1,
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const defaults = defaultState();
      const saved = JSON.parse(raw);
      // Merge the fixture too, so fields added later (e.g. teamName) get their defaults.
      return { ...defaults, ...saved, fixture: { ...defaults.fixture, ...saved.fixture } };
    }
  } catch {
    // Fall through to defaults if storage is unavailable or corrupt.
  }
  return defaultState();
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or blocked; the app still works for this session.
  }
}

const EXPORT_APP = 'teamsheeter';

/** Everything needed to restore both the Squad and Match day tabs. */
export function exportState(state: AppState): string {
  return JSON.stringify({ app: EXPORT_APP, version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

function parseSquad(data: unknown[]): Player[] {
  const seen = new Set<string>();
  return data.filter(isObject).flatMap((p) => {
    if (typeof p.name !== 'string') return [];
    let id = typeof p.id === 'string' && p.id ? p.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const positions = Array.isArray(p.positions) ? p.positions.filter((x): x is string => typeof x === 'string') : [];
    return [{ id, name: p.name, positions }];
  });
}

/**
 * Parse an exported file into app state, validating every part so a hand-edited or partial
 * file can't break the app. Throws with a readable message if the file isn't usable.
 */
export function importState(text: string): AppState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }

  const saved = isObject(data) && data.app === EXPORT_APP && isObject(data.state) ? data.state : null;
  if (!saved || !Array.isArray(saved.squad)) throw new Error('Not a Teamsheeter export file');

  const defaults = defaultState();
  const squad = parseSquad(saved.squad);
  const ids = new Set(squad.map((p) => p.id));
  const validId = (v: unknown): v is string => typeof v === 'string' && ids.has(v);
  const f = isObject(saved.fixture) ? saved.fixture : {};

  const halves =
    Array.isArray(f.halves) &&
    f.halves.length > 0 &&
    f.halves.every((h) => Array.isArray(h) && h.length > 0 && h.every((d) => typeof d === 'number' && d > 0))
      ? (f.halves as number[][])
      : defaults.fixture.halves;
  const formation = FORMATIONS.find((x) => x.id === f.formationId) ?? FORMATIONS[0];
  const keepers = halves.map((_, h) => {
    const k = Array.isArray(f.keepers) ? f.keepers[h] : null;
    return validId(k) ? k : null;
  });
  const fixture: Fixture = {
    date: str(f.date, defaults.fixture.date),
    teamName: str(f.teamName, ''),
    opponent: str(f.opponent, ''),
    venue: f.venue === 'home' || f.venue === 'away' ? f.venue : '',
    formationId: formation.id,
    halves,
    available: Array.isArray(f.available) ? [...new Set(f.available.filter(validId))] : [],
    keepers,
  };

  // Keep the saved schedule only if it matches the fixture's shape; otherwise it is regenerated.
  const periodCount = halves.reduce((n, h) => n + h.length, 0);
  const scheduleOk =
    Array.isArray(saved.schedule) &&
    saved.schedule.length === periodCount &&
    saved.schedule.every(
      (row) =>
        Array.isArray(row) &&
        row.length === formation.slots.length &&
        row.every((id) => id === null || validId(id)) &&
        new Set(row.filter(Boolean)).size === row.filter(Boolean).length,
    );

  const locks: Locks = {};
  if (isObject(saved.locks)) {
    for (const [key, id] of Object.entries(saved.locks)) if (validId(id)) locks[key] = id;
  }

  return {
    squad,
    fixture,
    schedule: scheduleOk ? (saved.schedule as Schedule) : null,
    scheduleKey: scheduleOk ? str(saved.scheduleKey, '') : '',
    locks,
    seed: typeof saved.seed === 'number' && Number.isFinite(saved.seed) ? saved.seed : 1,
  };
}
