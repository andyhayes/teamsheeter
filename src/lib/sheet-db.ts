import type { Match, TeamSheetRow } from './db-types';
import { FORMATIONS, PERIOD_PRESETS } from './presets';
import { insertRow, latestTeamSheet, type SquadPlayer } from './queries';
import { deriveSheet, scheduleFits, type SheetState } from './sheet-state';
import type { Player } from './types';

const DEFAULT_HALVES = PERIOD_PRESETS.find((p) => p.id === '12-6-12-666')!.halves;

export const squadPlayers = (squad: SquadPlayer[]): Player[] => squad.map((p) => ({ id: p.id, name: p.name, positions: p.positions }));

/** Builder state for a fixture's saved sheet. A saved schedule that still fits is kept, not regenerated. */
export function sheetStateFromRow(match: Match, teamName: string, squad: SquadPlayer[], row: TeamSheetRow): SheetState {
  const players = squadPlayers(squad);
  const ids = new Set(players.map((p) => p.id));
  const state: SheetState = {
    squad: players,
    fixture: {
      date: match.date,
      teamName,
      opponent: match.opponent,
      venue: match.side === 'home' || match.side === 'away' ? match.side : '',
      formationId: row.formation_id,
      halves: row.halves,
      available: players.filter((p) => row.available.includes(p.id)).map((p) => p.id),
      keepers: row.halves.map((_, h) => (row.keepers[h] && ids.has(row.keepers[h]!) ? row.keepers[h] : null)),
    },
    schedule: row.schedule,
    scheduleKey: '',
    locks: row.locks ?? {},
    seed: row.seed,
  };
  return scheduleFits(state) ? { ...state, scheduleKey: deriveSheet(state).inputKey } : { ...state, schedule: null };
}

/** The team_sheets columns for a builder state. */
export function rowFromSheetState(s: SheetState): Pick<TeamSheetRow, 'formation_id' | 'halves' | 'keepers' | 'available' | 'schedule' | 'locks' | 'seed'> {
  return {
    formation_id: s.fixture.formationId,
    halves: s.fixture.halves,
    keepers: s.fixture.keepers,
    available: s.fixture.available,
    schedule: s.schedule,
    locks: s.locks,
    seed: s.seed,
  };
}

/** Setup for a new sheet: every squad player available, the team's last formation and periods, the squad's keeper in goal. */
export function newSheetSetup(squad: SquadPlayer[], previous: TeamSheetRow | null) {
  const halves = previous?.halves ?? DEFAULT_HALVES;
  const keeper = squad.find((p) => p.positions.includes('GK'))?.id ?? null;
  return {
    formation_id: previous?.formation_id ?? FORMATIONS[0].id,
    halves,
    keepers: halves.map(() => keeper),
    available: squad.filter((p) => p.player.active).map((p) => p.id),
    schedule: null,
    locks: {},
    seed: 1,
  };
}

export async function createTeamSheet(match: Match, squad: SquadPlayer[]) {
  const previous = await latestTeamSheet(match.team_id, match.id);
  return insertRow<TeamSheetRow>('team_sheets', { match_id: match.id, team_id: match.team_id, ...newSheetSetup(squad, previous) });
}

/** Start from another sheet: same formation, periods, keepers and grid, limited to this squad. */
export function copySheet(from: TeamSheetRow, squad: SquadPlayer[]) {
  const ids = new Set(squad.map((p) => p.id));
  return {
    formation_id: from.formation_id,
    halves: from.halves,
    keepers: from.keepers.map((k) => (k && ids.has(k) ? k : null)),
    available: from.available.filter((id) => ids.has(id)),
    schedule: from.schedule,
    locks: Object.fromEntries(Object.entries(from.locks ?? {}).filter(([, id]) => ids.has(id))),
    seed: from.seed,
  };
}
