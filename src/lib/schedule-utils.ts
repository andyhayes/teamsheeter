import type { Period, PlayerId, Schedule } from './types';

export function flattenPeriods(halves: number[][]): Period[] {
  const periods: Period[] = [];
  let start = 0;
  halves.forEach((durations, half) => {
    for (const duration of durations) {
      periods.push({ index: periods.length, half, start, duration });
      start += duration;
    }
  });
  return periods;
}

export const matchLength = (halves: number[][]) =>
  halves.reduce((sum, h) => sum + h.reduce((a, b) => a + b, 0), 0);

export interface PlayerMinutes {
  total: number;
  gk: number;
  outfield: number;
  periodsOn: number;
  started: boolean;
}

export function playerMinutes(
  schedule: Schedule,
  periods: Period[],
  players: PlayerId[],
): Map<PlayerId, PlayerMinutes> {
  const result = new Map<PlayerId, PlayerMinutes>();
  for (const id of players) {
    result.set(id, { total: 0, gk: 0, outfield: 0, periodsOn: 0, started: false });
  }
  schedule.forEach((row, k) => {
    const d = periods[k]?.duration ?? 0;
    row.forEach((id, slot) => {
      const m = id ? result.get(id) : undefined;
      if (!m) return;
      m.total += d;
      m.periodsOn += 1;
      if (slot === 0) m.gk += d;
      else m.outfield += d;
      if (k === 0) m.started = true;
    });
  });
  return result;
}

export interface Balance {
  min: number;
  max: number;
  /** Average minutes for players who are not full-match keepers. */
  target: number;
}

/** Minutes spread across the squad, ignoring anyone who kept goal for the whole match. */
export function minutesBalance(
  minutes: Map<PlayerId, PlayerMinutes>,
  totalLength: number,
): Balance | null {
  const values = [...minutes.values()]
    .filter((m) => m.gk < totalLength)
    .map((m) => m.total);
  if (values.length === 0) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    target: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

export interface SubChange {
  on: PlayerId;
  off: PlayerId | null;
  slot: number;
}

export interface Move {
  player: PlayerId;
  from: number;
  to: number;
}

export interface Changeover {
  period: number;
  time: number;
  halfTime: boolean;
  subs: SubChange[];
  /** Players coming off whose place was not taken directly by an incoming sub. */
  offOnly: PlayerId[];
  moves: Move[];
}

/** The changes needed at the start of each period after the first. */
export function changeovers(schedule: Schedule, periods: Period[]): Changeover[] {
  const result: Changeover[] = [];
  for (let k = 1; k < schedule.length; k++) {
    const prev = schedule[k - 1];
    const cur = schedule[k];
    const prevSlot = new Map<PlayerId, number>();
    prev.forEach((id, s) => id && prevSlot.set(id, s));
    const curSlot = new Map<PlayerId, number>();
    cur.forEach((id, s) => id && curSlot.set(id, s));

    const subs: SubChange[] = [];
    const moves: Move[] = [];
    const pairedOff = new Set<PlayerId>();
    cur.forEach((id, slot) => {
      if (!id) return;
      const from = prevSlot.get(id);
      if (from === undefined) {
        const replaced = prev[slot];
        const off = replaced && !curSlot.has(replaced) ? replaced : null;
        if (off) pairedOff.add(off);
        subs.push({ on: id, off, slot });
      } else if (from !== slot) {
        moves.push({ player: id, from, to: slot });
      }
    });
    const offOnly = prev.filter(
      (id): id is PlayerId => !!id && !curSlot.has(id) && !pairedOff.has(id),
    );
    // Pair any remaining incoming subs with unpaired outgoing players for readability.
    for (const sub of subs) {
      if (!sub.off && offOnly.length) sub.off = offOnly.shift()!;
    }
    if (subs.length || moves.length || offOnly.length) {
      result.push({
        period: k,
        time: periods[k].start,
        halfTime: periods[k].half !== periods[k - 1].half,
        subs,
        offOnly,
        moves,
      });
    }
  }
  return result;
}

export const formatMinutes = (m: number) =>
  Number.isInteger(m) ? String(m) : m.toFixed(1).replace(/\.0$/, '');
