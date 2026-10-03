import { POSITION_FAMILIES } from './presets';
import { benchKey, lockKey, type Locks, type Period, type Player, type PlayerId, type Schedule } from './types';

export interface ScheduleInput {
  players: Player[];
  slots: string[];
  periods: Period[];
  /** Goalkeeper per half; null leaves the GK slot to the scheduler. */
  keepers: (PlayerId | null)[];
  locks?: Locks;
  seed?: number;
  /** Lower effort for quick previews. */
  quick?: boolean;
}

export interface ScheduleResult {
  schedule: Schedule;
  cost: number;
}

// Cost weights. Minutes balance is measured in minutes², so it dominates the rest.
const W_SUB = 6; // each player coming on mid-half
const W_SUB_HT = 2; // each player coming on at half-time
const W_STINT = 10; // each extra separate spell on the pitch
const W_BENCH = 4; // each consecutive period on the bench beyond the first
const W_MOVE = 6; // player changes position while staying on
const W_MOVE_HT = 2;
const W_RETURN_MOVE = 2; // returning sub plays somewhere other than their last position

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function positionCost(player: Player, label: string): number {
  if (player.positions.includes(label)) return 0;
  if (label === 'GK') return player.positions.length === 0 ? 20 : 40;
  if (player.positions.length === 0) return 3;
  const family = POSITION_FAMILIES[label];
  if (player.positions.some((p) => POSITION_FAMILIES[p] === family)) return 5;
  return 15;
}

interface Prepared {
  n: number;
  P: number;
  slotCount: number;
  durations: number[];
  halves: number[];
  /** Player index locked into each slot, per period (-1 = free). */
  slotLock: number[][];
  /** Per period, per player: 1 = must be on, 2 = must be on the bench, 0 = free. */
  forced: Uint8Array[];
  /** Players needed on the pitch per period. */
  needed: number[];
  /** Keeper (player index) per period, -1 if none. */
  gk: number[];
}

function prepare(input: ScheduleInput): Prepared {
  const { players, slots, periods, keepers, locks = {} } = input;
  const n = players.length;
  const P = periods.length;
  const index = new Map(players.map((p, i) => [p.id, i]));
  const slotLock: number[][] = [];
  const forced: Uint8Array[] = [];
  const gk: number[] = [];

  for (let k = 0; k < P; k++) {
    const row = new Array<number>(slots.length).fill(-1);
    const f = new Uint8Array(n);
    for (let s = 0; s < slots.length; s++) {
      const i = index.get(locks[lockKey(k, s)]);
      if (i !== undefined && !f[i]) {
        row[s] = i;
        f[i] = 1;
      }
    }
    for (let i = 0; i < n; i++) {
      if (!f[i] && locks[benchKey(k, players[i].id)]) f[i] = 2;
    }
    if (row[0] === -1) {
      const keeper = index.get(keepers[periods[k].half] ?? '');
      if (keeper !== undefined && !f[keeper]) {
        row[0] = keeper;
        f[keeper] = 1;
      }
    }
    gk.push(row[0]);
    slotLock.push(row);
    forced.push(f);
  }
  return {
    n,
    P,
    slotCount: slots.length,
    durations: periods.map((p) => p.duration),
    halves: periods.map((p) => p.half),
    slotLock,
    forced,
    needed: forced.map((f) => Math.min(slots.length, f.filter((v) => v !== 2).length)),
    gk,
  };
}

/** Cost of an on/off matrix: minutes balance plus disruption penalties. */
function lineupCost(on: Uint8Array[], pr: Prepared): number {
  const { n, P, durations, halves } = pr;
  let cost = 0;
  for (let i = 0; i < n; i++) {
    let mins = 0;
    let stints = 0;
    let benchRun = 0;
    for (let k = 0; k < P; k++) {
      if (on[k][i]) {
        mins += durations[k];
        if (k === 0 || !on[k - 1][i]) {
          stints++;
          if (k > 0) cost += halves[k] !== halves[k - 1] ? W_SUB_HT : W_SUB;
        }
        benchRun = 0;
      } else {
        benchRun++;
        if (benchRun > 1) cost += W_BENCH;
      }
    }
    cost += mins * mins;
    if (stints > 1) cost += (stints - 1) * W_STINT;
  }
  return cost;
}

function initialLineup(pr: Prepared, rand: () => number): Uint8Array[] {
  const { n, P, durations, forced, needed } = pr;
  const mins = new Array<number>(n).fill(0);
  const on: Uint8Array[] = [];
  for (let k = 0; k < P; k++) {
    const row = new Uint8Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (forced[k][i] === 1) {
        row[i] = 1;
        count++;
      }
    }
    const jitter = Array.from({ length: n }, () => rand());
    const order = [...Array(n).keys()]
      .filter((i) => !row[i] && forced[k][i] !== 2)
      .sort((a, b) => {
        const cont = (k > 0 ? on[k - 1][b] - on[k - 1][a] : 0) * 0.5;
        return mins[a] - mins[b] + cont + (jitter[a] - jitter[b]) * 0.1;
      });
    for (const i of order) {
      if (count >= needed[k]) break;
      row[i] = 1;
      count++;
    }
    for (let i = 0; i < n; i++) if (row[i]) mins[i] += durations[k];
    on.push(row);
  }
  return on;
}

/** Simulated annealing over swaps of one on-pitch player with one benched player in a period. */
function optimiseLineup(pr: Prepared, rand: () => number, iterations: number): Uint8Array[] {
  const { n, P, forced } = pr;
  let on = initialLineup(pr, rand);
  let cost = lineupCost(on, pr);
  let best = on.map((r) => r.slice());
  let bestCost = cost;
  const t0 = 60;
  const t1 = 0.3;
  for (let it = 0; it < iterations; it++) {
    const temp = t0 * Math.pow(t1 / t0, it / iterations);
    const k = Math.floor(rand() * P);
    const row = on[k];
    const ons: number[] = [];
    const offs: number[] = [];
    for (let i = 0; i < n; i++) {
      if (row[i]) {
        if (!forced[k][i]) ons.push(i);
      } else if (!forced[k][i]) offs.push(i);
    }
    if (!ons.length || !offs.length) continue;
    const a = ons[Math.floor(rand() * ons.length)];
    const b = offs[Math.floor(rand() * offs.length)];
    row[a] = 0;
    row[b] = 1;
    const next = lineupCost(on, pr);
    const delta = next - cost;
    if (delta <= 0 || rand() < Math.exp(-delta / temp)) {
      cost = next;
      if (cost < bestCost) {
        bestCost = cost;
        best = on.map((r) => r.slice());
      }
    } else {
      row[a] = 1;
      row[b] = 0;
    }
  }
  return best;
}

/** Minimum-cost assignment of players to slots (players.length <= slots.length) via bitmask DP. */
function assign(costs: number[][], slotCount: number): { slots: number[]; cost: number } {
  const m = costs.length;
  const size = 1 << slotCount;
  const dp = new Float64Array(size).fill(Infinity);
  const choice = new Int8Array(size).fill(-1);
  dp[0] = 0;
  // Players are placed in order, so popcount(mask) identifies the player and choice[mask] is unambiguous.
  const layers: number[][] = Array.from({ length: m + 1 }, () => []);
  layers[0].push(0);
  const seen = new Uint8Array(size);
  for (let p = 0; p < m; p++) {
    for (const mask of layers[p]) {
      for (let s = 0; s < slotCount; s++) {
        if (mask & (1 << s)) continue;
        const nm = mask | (1 << s);
        const c = dp[mask] + costs[p][s];
        if (c < dp[nm]) {
          dp[nm] = c;
          choice[nm] = s;
        }
        if (!seen[nm]) {
          seen[nm] = 1;
          layers[p + 1].push(nm);
        }
      }
    }
  }
  let bestMask = -1;
  for (const mask of layers[m]) if (bestMask === -1 || dp[mask] < dp[bestMask]) bestMask = mask;
  const result = new Array<number>(m).fill(-1);
  let mask = bestMask;
  for (let p = m - 1; p >= 0; p--) {
    const s = choice[mask];
    result[p] = s;
    mask &= ~(1 << s);
  }
  return { slots: result, cost: dp[bestMask] };
}

/** Place on-pitch players into slots, period by period, favouring preferences and continuity. */
function placePlayers(
  on: Uint8Array[],
  pr: Prepared,
  input: ScheduleInput,
): { schedule: number[][]; cost: number } {
  const { players, slots } = input;
  const { n, P, slotLock, halves } = pr;
  const schedule: number[][] = [];
  const lastSlot = new Array<number>(n).fill(-1);
  let total = 0;

  for (let k = 0; k < P; k++) {
    const row = slotLock[k].slice();
    const placed = new Set(row.filter((i) => i >= 0));
    const freeSlots = row.map((v, s) => (v === -1 ? s : -1)).filter((s) => s >= 0);
    const toPlace = [...Array(n).keys()].filter((i) => on[k][i] && !placed.has(i));
    const prevRow = k > 0 ? schedule[k - 1] : null;

    const costs = toPlace.map((i) =>
      freeSlots.map((s) => {
        let c = positionCost(players[i], slots[s]);
        const prevSlot = prevRow ? prevRow.indexOf(i) : -1;
        // Swapping between two slots with the same label (e.g. CB ↔ CB) is nearly free.
        if (prevSlot > 0 && prevSlot !== s) {
          c += slots[prevSlot] === slots[s] ? 1 : halves[k] !== halves[k - 1] ? W_MOVE_HT : W_MOVE;
        } else if (prevSlot === -1 && lastSlot[i] > 0 && slots[lastSlot[i]] !== slots[s]) {
          c += W_RETURN_MOVE;
        }
        return c;
      }),
    );
    // Locked players still pay their position cost so the total reflects reality.
    row.forEach((i, s) => {
      if (i >= 0) total += positionCost(players[i], slots[s]);
    });
    if (toPlace.length) {
      const { slots: chosen, cost } = assign(costs, freeSlots.length);
      total += cost;
      chosen.forEach((idx, p) => (row[freeSlots[idx]] = toPlace[p]));
    }
    row.forEach((i, s) => i >= 0 && (lastSlot[i] = s));
    schedule.push(row);
  }
  return { schedule, cost: total };
}

export function generateSchedule(input: ScheduleInput): ScheduleResult {
  const pr = prepare(input);
  if (pr.P === 0 || pr.n === 0) {
    return { schedule: input.periods.map(() => input.slots.map(() => null)), cost: 0 };
  }
  const restarts = input.quick ? 2 : 8;
  const iterations = input.quick ? 1500 : 6000;
  const rand = mulberry32(input.seed ?? 1);
  let best: ScheduleResult | null = null;
  for (let r = 0; r < restarts; r++) {
    const on = optimiseLineup(pr, rand, iterations);
    const placed = placePlayers(on, pr, input);
    const cost = lineupCost(on, pr) + placed.cost;
    if (!best || cost < best.cost) {
      best = {
        cost,
        schedule: placed.schedule.map((row) => row.map((i) => (i >= 0 ? input.players[i].id : null))),
      };
    }
  }
  return best!;
}
