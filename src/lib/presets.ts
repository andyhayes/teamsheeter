import type { Formation, PeriodPreset, Player } from './types';

export const FORMATIONS: Formation[] = [
  { id: '9-323', name: '9v9 · 3-2-3', slots: ['GK', 'CB', 'CB', 'CB', 'CM', 'CM', 'LW', 'RW', 'ST'] },
  { id: '9-wb', name: '9v9 · 2-2-1-2-1 (wing-backs)', slots: ['GK', 'CB', 'CB', 'LWB', 'RWB', 'CDM', 'CAM', 'CAM', 'ST'] },
  { id: '9-332', name: '9v9 · 3-3-2', slots: ['GK', 'LB', 'CB', 'RB', 'LM', 'CM', 'RM', 'ST', 'ST'] },
  { id: '7-231', name: '7v7 · 2-3-1', slots: ['GK', 'CB', 'CB', 'LM', 'CM', 'RM', 'ST'] },
  { id: '7-321', name: '7v7 · 3-2-1', slots: ['GK', 'LB', 'CB', 'RB', 'CM', 'CM', 'ST'] },
  { id: '5-121', name: '5v5 · 1-2-1', slots: ['GK', 'CB', 'LW', 'RW', 'ST'] },
  { id: '11-442', name: '11v11 · 4-4-2', slots: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'] },
  { id: '11-433', name: '11v11 · 4-3-3', slots: ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'RW', 'ST'] },
];

/** Period structures used in TeamSheetTemplates.xlsx, plus a few common extras. */
export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: '10x3', name: '3 × 10 each half', halves: [[10, 10, 10], [10, 10, 10]] },
  { id: '12-6-12', name: '12-6-12 | 12-6-12', halves: [[12, 6, 12], [12, 6, 12]] },
  { id: '12-6-12-666', name: '12-6-12 | 12-6-6-6', halves: [[12, 6, 12], [12, 6, 6, 6]] },
  { id: '12-12-6', name: '12-12-6 | 6-12-12', halves: [[12, 12, 6], [6, 12, 12]] },
  { id: '7.5x4', name: '4 × 7.5 each half', halves: [[7.5, 7.5, 7.5, 7.5], [7.5, 7.5, 7.5, 7.5]] },
  { id: '15x2', name: '2 × 15 each half', halves: [[15, 15], [15, 15]] },
  { id: '6x5', name: '5 × 6 each half', halves: [[6, 6, 6, 6, 6], [6, 6, 6, 6, 6]] },
  { id: '10-5-10', name: '10-5-10 | 10-5-5-5 (50 min)', halves: [[10, 5, 10], [10, 5, 5, 5]] },
];

export const POSITION_FAMILIES: Record<string, 'GK' | 'DEF' | 'MID' | 'ATT'> = {
  GK: 'GK',
  CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CM: 'MID', CDM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', ST: 'ATT',
};

export const ALL_POSITIONS = Object.keys(POSITION_FAMILIES);

/** Starter squad taken from the 14-player template, positions from where each player started. */
export const DEMO_SQUAD: Omit<Player, 'id'>[] = [
  { name: 'Thomas W', positions: ['GK', 'CB', 'CM'] },
  { name: 'Lucas', positions: ['GK'] },
  { name: 'Peter', positions: ['CB', 'CM'] },
  { name: 'Jonah', positions: ['CB'] },
  { name: 'Will', positions: ['CB', 'CM'] },
  { name: 'Blake', positions: ['CB'] },
  { name: 'Oscar', positions: ['CM'] },
  { name: 'Theo', positions: ['CM'] },
  { name: 'Thomas L', positions: ['LW', 'CB', 'CM'] },
  { name: 'Alex', positions: ['RW'] },
  { name: 'Jax', positions: ['ST', 'CB'] },
  { name: 'George A', positions: ['LW', 'RW'] },
  { name: 'George B', positions: ['ST', 'LW'] },
  { name: 'Ethan', positions: ['ST'] },
  { name: 'Louie', positions: ['CB', 'LW'] },
  { name: 'Myles', positions: [] },
];
