import { describe, expect, it } from 'vitest';
import { defenceSpells, goalTallies, minutesByPosition, onPitchGoals, periodAt, statsFromSheet, type GoalEvent } from './match-stats';
import { FORMATIONS } from './presets';
import { flattenPeriods } from './schedule-utils';

// Wigan Junior Latics Yellows (A), 1-2, from the season workbook's Teamsheets tab.
const slots = FORMATIONS.find((f) => f.id === '9-323')!.slots; // GK CB CB CB CM CM LW RW ST
const periods = flattenPeriods([[10, 10, 10], [10, 10, 10]]);
const columns = [
  ['Lucas', 'Thomas W', 'Jax', 'Will', 'Theo', 'Peter', 'George', 'Alex', 'Ethan'],
  ['Lucas', 'Thomas W', 'Jax', 'Will', 'Theo', 'Peter', 'Thomas L', 'Alex', 'Ethan'],
  ['Lucas', 'Thomas W', 'Jax', 'Will', 'Theo', 'Peter', 'Thomas L', 'George', 'Ethan'],
  ['Lucas', 'Thomas W', 'Jax', 'Peter', 'Theo', 'George', 'Thomas L', 'Will', 'Alex'],
  ['Lucas', 'Will', 'Jax', 'Peter', 'Theo', 'George', 'Thomas L', 'Alex', 'Ethan'],
  ['Lucas', 'Will', 'Peter', 'Thomas W', 'Theo', 'George', 'Thomas L', 'Alex', 'Ethan'],
];
const schedule = columns;
// Goal times consistent with the workbook's on-pitch columns: 1-0 and 1-1 in the 4th period, 1-2 in the 6th.
const goals: GoalEvent[] = [
  { side: 'for', minute: 34, scorer_id: 'Thomas L', assist_id: 'Alex' },
  { side: 'against', minute: 38 },
  { side: 'against', minute: 57 },
];

describe('minutesByPosition', () => {
  it("matches the workbook's Data Entry rows", () => {
    const m = minutesByPosition(schedule, slots, periods);
    expect(Object.fromEntries(m)).toEqual({
      Lucas: { GK: 60 },
      Alex: { RW: 40, ST: 10 },
      Ethan: { ST: 50 },
      George: { CM: 30, LW: 10, RW: 10 },
      Jax: { CB: 50 },
      Peter: { CB: 30, CM: 30 },
      Theo: { CM: 60 },
      'Thomas L': { LW: 50 },
      'Thomas W': { CB: 50 },
      Will: { CB: 50, RW: 10 },
    });
  });
});

describe('periodAt', () => {
  it('puts a goal in minute 10 in the first period and minute 11 in the second', () => {
    expect(periodAt(periods, 10)).toBe(0);
    expect(periodAt(periods, 11)).toBe(1);
    expect(periodAt(periods, 0)).toBe(0);
    expect(periodAt(periods, 63)).toBe(5); // stoppage time
  });
});

describe('onPitchGoals', () => {
  it("matches the workbook's goals for / against on pitch", () => {
    const g = onPitchGoals(schedule, periods, goals);
    const expected: Record<string, [number, number]> = {
      Alex: [1, 2], Ethan: [0, 1], George: [1, 2], Jax: [1, 1], Peter: [1, 2], Theo: [1, 2],
      'Thomas L': [1, 2], 'Thomas W': [1, 2], Will: [1, 2], Lucas: [1, 2],
    };
    for (const [id, [f, a]] of Object.entries(expected)) expect(g.get(id), id).toEqual({ for: f, against: a });
  });
});

describe('defenceSpells', () => {
  it('merges consecutive periods with the same back three', () => {
    expect(defenceSpells(schedule, slots, periods, goals)).toEqual([
      { player_ids: ['Jax', 'Thomas W', 'Will'], minutes: 30, goals_conceded: 0 },
      { player_ids: ['Jax', 'Peter', 'Thomas W'], minutes: 10, goals_conceded: 1 },
      { player_ids: ['Jax', 'Peter', 'Will'], minutes: 10, goals_conceded: 0 },
      { player_ids: ['Peter', 'Thomas W', 'Will'], minutes: 10, goals_conceded: 1 },
    ]);
  });

  it('returns nothing for a formation without defensive slots', () => {
    expect(defenceSpells([['a', 'b']], ['GK', 'ST'], flattenPeriods([[10]]), [])).toEqual([]);
  });
});

describe('goalTallies and statsFromSheet', () => {
  it('credits scorers and assists, but not opposition own goals', () => {
    const t = goalTallies([...goals, { side: 'for', minute: 50, scorer_id: 'Ethan', own_goal: true }]);
    expect(Object.fromEntries(t)).toEqual({ 'Thomas L': { goals: 1, assists: 0 }, Alex: { goals: 0, assists: 1 } });
  });

  it('prefills every squad player, marking absentees unavailable', () => {
    const rows = statsFromSheet(['Alex', 'Blake'], ['Alex'], schedule, slots, periods, goals);
    expect(rows).toEqual([
      { player_id: 'Alex', available: true, minutes: { RW: 40, ST: 10 }, goals: 0, assists: 1, goals_for_on_pitch: 1, goals_against_on_pitch: 2 },
      { player_id: 'Blake', available: false, minutes: {}, goals: 0, assists: 0, goals_for_on_pitch: 0, goals_against_on_pitch: 0 },
    ]);
  });
});
