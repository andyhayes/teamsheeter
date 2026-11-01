import { describe, expect, it, vi } from 'vitest';
import type { Match, PlayerRow, SquadRow, TeamSheetRow } from './db-types';
import type { SquadPlayer } from './queries';
import { copySheet, newSheetSetup, rowFromSheetState, sheetStateFromRow } from './sheet-db';
import { deriveSheet, regenerate } from './sheet-state';

// Pure mapping only: keep the Supabase client (created from .env.local) out of the test.
vi.mock('./queries', () => ({ insertRow: vi.fn(), latestTeamSheet: vi.fn() }));

const player = (id: string, positions: string[], active = true): SquadPlayer => ({
  id,
  name: id.toUpperCase(),
  positions,
  player: { id, team_id: 't', name: id.toUpperCase(), dob: null, positions, active } as PlayerRow,
  squad: { season_id: 's', player_id: id, team_id: 't', positions: null, shirt_no: null, sort_order: 0 } as SquadRow,
});
const squad = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map((id, i) => player(id, i === 0 ? ['GK'] : i < 4 ? ['CB'] : []));
const match = { id: 'm', team_id: 't', date: '2026-10-25', opponent: 'Rovers', side: 'home' } as Match;

describe('newSheetSetup', () => {
  it("starts with every active squad player, the squad's keeper and the last sheet's setup", () => {
    const previous = { formation_id: '9-wb', halves: [[15, 15], [15, 15]] } as TeamSheetRow;
    const withInactive = [...squad, player('z', [], false)];
    const setup = newSheetSetup(withInactive, previous);
    expect(setup).toMatchObject({ formation_id: '9-wb', halves: [[15, 15], [15, 15]], keepers: ['a', 'a'], schedule: null });
    expect(setup.available).toEqual(squad.map((p) => p.id));
  });
});

describe('sheetStateFromRow', () => {
  const setup = newSheetSetup(squad, null);
  const row = { match_id: 'm', team_id: 't', updated_at: '', ...setup } as TeamSheetRow;

  it("keeps a saved schedule that still fits, even after squad positions change", () => {
    const generated = regenerate(sheetStateFromRow(match, 'U13s', squad, row));
    const saved = { ...row, ...rowFromSheetState(generated) };
    const changedPositions = squad.map((p) => (p.id === 'e' ? { ...p, positions: ['ST'] } : p));
    const state = sheetStateFromRow(match, 'U13s', changedPositions, saved);
    expect(state.schedule).toEqual(generated.schedule);
    expect(state.scheduleKey).toBe(deriveSheet(state).inputKey); // so the builder won't regenerate it
    expect(state.fixture).toMatchObject({ opponent: 'Rovers', venue: 'home', teamName: 'U13s' });
  });

  it('drops a schedule naming a player who has left the squad', () => {
    const generated = regenerate(sheetStateFromRow(match, 'U13s', squad, row));
    const saved = { ...row, ...rowFromSheetState(generated) };
    const state = sheetStateFromRow(match, 'U13s', squad.filter((p) => p.id !== 'b'), saved);
    expect(state.schedule).toBeNull();
    expect(state.fixture.available).not.toContain('b');
  });
});

describe('copySheet', () => {
  it("limits the copied players, keepers and locks to this squad", () => {
    const from = { formation_id: '9-323', halves: [[30], [30]], keepers: ['x', 'a'], available: ['a', 'x'], schedule: null, locks: { '0:1': 'x', '0:2': 'a' }, seed: 3 } as unknown as TeamSheetRow;
    expect(copySheet(from, squad)).toEqual({ formation_id: '9-323', halves: [[30], [30]], keepers: [null, 'a'], available: ['a'], schedule: null, locks: { '0:2': 'a' }, seed: 3 });
  });
});
