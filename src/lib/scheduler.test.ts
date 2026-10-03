import { describe, expect, it } from 'vitest';
import { FORMATIONS, PERIOD_PRESETS } from './presets';
import { generateSchedule } from './scheduler';
import { changeovers, flattenPeriods, minutesBalance, playerMinutes } from './schedule-utils';
import type { Player } from './types';

const slots = FORMATIONS[0].slots; // 9v9 3-2-3
const preset = (id: string) => PERIOD_PRESETS.find((p) => p.id === id)!.halves;

function squad(count: number): Player[] {
  const positions = [['GK'], ['CB'], ['CB'], ['CB'], ['CM'], ['CM'], ['LW'], ['RW'], ['ST']];
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    positions: positions[i] ?? [],
  }));
}

function run(count: number, halvesId: string, extra: Partial<Parameters<typeof generateSchedule>[0]> = {}) {
  const players = squad(count);
  const halves = preset(halvesId);
  const periods = flattenPeriods(halves);
  const { schedule } = generateSchedule({ players, slots, periods, keepers: ['p0', 'p0'], ...extra });
  const minutes = playerMinutes(schedule, periods, players.map((p) => p.id));
  const balance = minutesBalance(minutes, 60)!;
  return { schedule, periods, minutes, balance, players };
}

describe('generateSchedule', () => {
  // Expected spreads match the best the spreadsheet templates achieve.
  it.each([
    [10, '10x3', 50, 60, '9 outfielders: 480/9 is not whole, best is 50/60'],
    [11, '12-6-12', 48, 48, '10 outfielders, perfectly even'],
    [12, '12-6-12-666', 42, 48, '11 outfielders (template W column: 42/48)'],
    [13, '10x3', 40, 40, '12 outfielders, perfectly even'],
    [14, '10x3', 30, 40, '13 outfielders'],
  ])('%i players with %s', (count, halvesId, min, max) => {
    const { schedule, balance } = run(count, halvesId);
    for (const row of schedule) {
      expect(row.every(Boolean)).toBe(true);
      expect(new Set(row).size).toBe(row.length);
      expect(row[0]).toBe('p0');
    }
    expect(balance.min).toBeGreaterThanOrEqual(min);
    expect(balance.max).toBeLessThanOrEqual(max);
  });

  it('balances 10 players over 4 × 7.5 to within one period', () => {
    const { balance } = run(10, '7.5x4');
    expect(balance.max - balance.min).toBeLessThanOrEqual(7.5);
  });

  it('respects locked cells', () => {
    const { schedule } = run(12, '10x3', { locks: { '0:8': 'p11', '3:1': 'p11' } });
    expect(schedule[0][8]).toBe('p11');
    expect(schedule[3][1]).toBe('p11');
  });

  it('keeps bench-locked players off the pitch and still balances', () => {
    const locks = { '0:sub:p1': 'p1', '0:sub:p2': 'p2', '0:sub:p3': 'p3' };
    const { schedule, balance } = run(12, '12-6-12-666', { locks });
    for (const id of ['p1', 'p2', 'p3']) expect(schedule[0]).not.toContain(id);
    expect(balance.min).toBeGreaterThanOrEqual(42);
    expect(balance.max).toBeLessThanOrEqual(48);
  });

  it('leaves slots empty rather than playing a bench-locked player', () => {
    const { schedule } = run(9, '10x3', { locks: { '2:sub:p4': 'p4' } });
    expect(schedule[2]).not.toContain('p4');
    expect(schedule[2].filter(Boolean)).toHaveLength(8);
  });

  it('puts different keepers in each half and still balances totals', () => {
    const { schedule, minutes } = run(13, '10x3', { keepers: ['p0', 'p1'] });
    expect(schedule[0][0]).toBe('p0');
    expect(schedule[5][0]).toBe('p1');
    const totals = [...minutes.values()].map((m) => m.total);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(10);
  });

  it('keeps players in their preferred positions when possible', () => {
    const { schedule, players } = run(9, '10x3');
    schedule[0].forEach((id, s) => {
      const player = players.find((p) => p.id === id)!;
      expect(player.positions).toContain(slots[s]);
    });
  });

  it('copes with fewer players than slots', () => {
    const { schedule } = run(7, '10x3');
    for (const row of schedule) expect(row.filter(Boolean)).toHaveLength(7);
  });

  it('is deterministic for a given seed', () => {
    expect(run(12, '10x3', { seed: 5 }).schedule).toEqual(run(12, '10x3', { seed: 5 }).schedule);
  });
});

describe('changeovers', () => {
  it('pairs incoming and outgoing players by slot', () => {
    const periods = flattenPeriods([[10, 10]]);
    const result = changeovers(
      [
        ['gk', 'a', 'b'],
        ['gk', 'c', 'a'],
      ],
      periods,
    );
    expect(result).toEqual([
      {
        period: 1,
        time: 10,
        halfTime: false,
        subs: [{ on: 'c', off: 'b', slot: 1 }],
        offOnly: [],
        moves: [{ player: 'a', from: 1, to: 2 }],
      },
    ]);
  });
});
