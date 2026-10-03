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
  const available = squad.slice(1, 13).map((p) => p.id);
  return {
    squad,
    fixture: {
      date: new Date().toISOString().slice(0, 10),
      opponent: '',
      venue: '',
      formationId: FORMATIONS[0].id,
      halves: PERIOD_PRESETS.find((p) => p.id === '12-6-12-666')!.halves,
      available,
      keepers: [squad[1].id, squad[1].id],
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
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
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
