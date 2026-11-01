import { FORMATIONS } from './presets';
import { generateSchedule } from './scheduler';
import { flattenPeriods } from './schedule-utils';
import type { AppState } from './storage';
import { benchKey, lockKey, parseLockKey, type Locks, type Player, type PlayerId } from './types';

/** Everything the team-sheet builder works on: the squad, fixture setup and generated schedule. */
export type SheetState = AppState;

export interface CellRef {
  period: number;
  slot?: number;
  benchPlayer?: PlayerId;
}

export function deriveSheet(state: SheetState) {
  const formation = FORMATIONS.find((f) => f.id === state.fixture.formationId) ?? FORMATIONS[0];
  const periods = flattenPeriods(state.fixture.halves);
  const byId = new Map(state.squad.map((p) => [p.id, p]));
  const players = state.fixture.available
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p);
  const inputKey = JSON.stringify([
    formation.id,
    state.fixture.halves,
    state.fixture.keepers,
    players.map((p) => [p.id, p.positions]),
  ]);
  return { formation, periods, players, inputKey };
}

/** Drop locks that no longer fit the formation, periods or available players. */
function validLocks(locks: Locks, periodCount: number, slotCount: number, players: Player[]): Locks {
  const ids = new Set(players.map((p) => p.id));
  const result: Locks = {};
  for (const [key, id] of Object.entries(locks)) {
    const { period, slot } = parseLockKey(key);
    if (period < periodCount && (slot === null || slot < slotCount) && ids.has(id)) result[key] = id;
  }
  return result;
}

export function regenerate(state: SheetState, seed = state.seed, locks = state.locks): SheetState {
  const { formation, periods, players, inputKey } = deriveSheet(state);
  const kept = validLocks(locks, periods.length, formation.slots.length, players);
  const { schedule } = generateSchedule({
    players,
    slots: formation.slots,
    periods,
    keepers: state.fixture.keepers,
    locks: kept,
    seed,
  });
  return { ...state, schedule, scheduleKey: inputKey, locks: kept, seed };
}

/**
 * Whether a saved schedule still fits the sheet's formation, periods and available players.
 * A saved sheet that fits is kept as-is (even if squad positions have changed since) rather
 * than being regenerated on load.
 */
export function scheduleFits(state: SheetState): boolean {
  const { formation, periods, players } = deriveSheet(state);
  const ids = new Set(players.map((p) => p.id));
  const s = state.schedule;
  return (
    !!s &&
    s.length === periods.length &&
    s.every((row) => row.length === formation.slots.length && row.every((id) => id === null || ids.has(id)))
  );
}

export const sameCell = (a: CellRef, b: CellRef) =>
  a.period === b.period && a.slot === b.slot && a.benchPlayer === b.benchPlayer;

export function swapCells(state: SheetState, a: CellRef, b: CellRef): SheetState {
  if (!state.schedule) return state;
  const k = a.period;
  const row = [...state.schedule[k]];
  const locks = { ...state.locks };
  const setSlot = (slot: number, id: string | null) => {
    row[slot] = id;
    if (id) locks[lockKey(k, slot)] = id;
    else delete locks[lockKey(k, slot)];
  };
  if (a.slot !== undefined && b.slot !== undefined) {
    const pa = row[a.slot];
    setSlot(a.slot, row[b.slot]);
    setSlot(b.slot, pa);
  } else if (a.slot !== undefined || b.slot !== undefined) {
    const pitch = (a.slot !== undefined ? a : b).slot!;
    const bench = (a.slot !== undefined ? b : a).benchPlayer!;
    const goingOff = row[pitch];
    delete locks[benchKey(k, bench)];
    if (goingOff) locks[benchKey(k, goingOff)] = goingOff;
    setSlot(pitch, bench);
  } else {
    return state;
  }
  const schedule = state.schedule.map((r, i) => (i === k ? row : r));
  return { ...state, schedule, locks };
}

export function toggleLock(s: SheetState, period: number, slot: number): SheetState {
  const key = lockKey(period, slot);
  const locks = { ...s.locks };
  const id = s.schedule?.[period][slot];
  if (locks[key]) delete locks[key];
  else if (id) locks[key] = id;
  return { ...s, locks };
}

export function toggleBenchLock(s: SheetState, period: number, id: PlayerId): SheetState {
  const key = benchKey(period, id);
  const locks = { ...s.locks };
  if (locks[key]) delete locks[key];
  else locks[key] = id;
  return { ...s, locks };
}

/** Hold a player on the bench for the first period (or release them), then rebalance. */
export function toggleStartingSub(s: SheetState, id: PlayerId): SheetState {
  const key = benchKey(0, id);
  const locks = { ...s.locks };
  if (locks[key]) {
    delete locks[key];
    return regenerate(s, s.seed, locks);
  }
  locks[key] = id;
  for (const [k, v] of Object.entries(locks)) {
    const { period, slot } = parseLockKey(k);
    if (period === 0 && slot !== null && v === id) delete locks[k];
  }
  return regenerate(s, s.seed, locks);
}

export function togglePeriodLock(s: SheetState, period: number): SheetState {
  const row = s.schedule?.[period] ?? [];
  const bench = deriveSheet(s).players.map((p) => p.id).filter((id) => !row.includes(id));
  const locks = { ...s.locks };
  const allLocked =
    row.every((id, slot) => !id || locks[lockKey(period, slot)]) &&
    bench.every((id) => locks[benchKey(period, id)]);
  const set = (key: string, id: PlayerId) => {
    if (allLocked) delete locks[key];
    else locks[key] = id;
  };
  row.forEach((id, slot) => id && set(lockKey(period, slot), id));
  bench.forEach((id) => set(benchKey(period, id), id));
  return { ...s, locks };
}
