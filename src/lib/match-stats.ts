import { POSITION_FAMILIES } from './presets';
import type { Period, PlayerId, Schedule } from './types';

/** A goal as logged during or after the match. `minute` is the match minute (1 = the first minute). */
export interface GoalEvent {
  side: 'for' | 'against';
  minute: number | null;
  scorer_id?: string | null;
  assist_id?: string | null;
  own_goal?: boolean;
}

/**
 * The period a goal in `minute` falls in. Minute m covers the time (m-1, m], so a goal in the
 * 10th minute belongs to a 0–10 period, not the one starting at 10. Goals after the final
 * whistle (stoppage time) count in the last period.
 */
export function periodAt(periods: Period[], minute: number): number {
  const t = minute - 0.5;
  const k = periods.findIndex((p) => t >= p.start && t < p.start + p.duration);
  if (k >= 0) return k;
  return t < 0 ? 0 : periods.length - 1;
}

/** Minutes each player spent in each position label, e.g. {GK: 10, CB: 30}. */
export function minutesByPosition(schedule: Schedule, slots: string[], periods: Period[]): Map<PlayerId, Record<string, number>> {
  const result = new Map<PlayerId, Record<string, number>>();
  schedule.forEach((row, k) => {
    const d = periods[k]?.duration ?? 0;
    row.forEach((id, s) => {
      if (!id) return;
      const m = result.get(id) ?? {};
      m[slots[s]] = (m[slots[s]] ?? 0) + d;
      result.set(id, m);
    });
  });
  return result;
}

/** Goals scored and conceded while each player was on the pitch. Goals without a minute are skipped. */
export function onPitchGoals(schedule: Schedule, periods: Period[], goals: GoalEvent[]): Map<PlayerId, { for: number; against: number }> {
  const result = new Map<PlayerId, { for: number; against: number }>();
  for (const g of goals) {
    if (g.minute == null || !periods.length) continue;
    for (const id of schedule[periodAt(periods, g.minute)] ?? []) {
      if (!id) continue;
      const r = result.get(id) ?? { for: 0, against: 0 };
      r[g.side] += 1;
      result.set(id, r);
    }
  }
  return result;
}

/** Goals and assists per player from the goal log (own goals by the opposition credit nobody). */
export function goalTallies(goals: GoalEvent[]): Map<PlayerId, { goals: number; assists: number }> {
  const result = new Map<PlayerId, { goals: number; assists: number }>();
  const get = (id: string) => result.get(id) ?? { goals: 0, assists: 0 };
  for (const g of goals) {
    if (g.side !== 'for') continue;
    if (g.scorer_id && !g.own_goal) result.set(g.scorer_id, { ...get(g.scorer_id), goals: get(g.scorer_id).goals + 1 });
    if (g.assist_id) result.set(g.assist_id, { ...get(g.assist_id), assists: get(g.assist_id).assists + 1 });
  }
  return result;
}

export interface Spell {
  player_ids: PlayerId[];
  minutes: number;
  goals_conceded: number;
}

/**
 * Consecutive periods with the same defenders on the pitch (any defensive slot: CB, LB, RWB…),
 * and the goals conceded during each. The same back line in separate spells stays separate.
 */
export function defenceSpells(schedule: Schedule, slots: string[], periods: Period[], goals: GoalEvent[]): Spell[] {
  const defSlots = slots.flatMap((label, s) => (POSITION_FAMILIES[label] === 'DEF' ? [s] : []));
  if (!defSlots.length) return [];
  const conceded = periods.map(() => 0);
  for (const g of goals) {
    if (g.side === 'against' && g.minute != null && periods.length) conceded[periodAt(periods, g.minute)] += 1;
  }
  const spells: Spell[] = [];
  let lastKey = '';
  schedule.forEach((row, k) => {
    const ids = defSlots.map((s) => row[s]).filter((id): id is PlayerId => !!id).sort();
    if (!ids.length) {
      lastKey = '';
      return;
    }
    const key = ids.join(',');
    const d = periods[k]?.duration ?? 0;
    if (key === lastKey) {
      const spell = spells[spells.length - 1];
      spell.minutes += d;
      spell.goals_conceded += conceded[k];
    } else {
      spells.push({ player_ids: ids, minutes: d, goals_conceded: conceded[k] });
    }
    lastKey = key;
  });
  return spells;
}

export interface PlayerStatsDraft {
  player_id: PlayerId;
  available: boolean;
  minutes: Record<string, number>;
  goals: number;
  assists: number;
  goals_for_on_pitch: number;
  goals_against_on_pitch: number;
}

/**
 * Prefilled stats for every squad player from the team sheet and goal log. Shots, saves and
 * anything else counted by hand are left for the coach.
 */
export function statsFromSheet(
  squad: PlayerId[],
  available: PlayerId[],
  schedule: Schedule | null,
  slots: string[],
  periods: Period[],
  goals: GoalEvent[],
): PlayerStatsDraft[] {
  const avail = new Set(available);
  const minutes = schedule ? minutesByPosition(schedule, slots, periods) : new Map();
  const onPitch = schedule ? onPitchGoals(schedule, periods, goals) : new Map();
  const tallies = goalTallies(goals);
  return squad.map((id) => ({
    player_id: id,
    available: avail.has(id),
    minutes: minutes.get(id) ?? {},
    goals: tallies.get(id)?.goals ?? 0,
    assists: tallies.get(id)?.assists ?? 0,
    goals_for_on_pitch: onPitch.get(id)?.for ?? 0,
    goals_against_on_pitch: onPitch.get(id)?.against ?? 0,
  }));
}
