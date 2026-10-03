export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  /** Preferred positions, e.g. ["CB", "CM"]. Include "GK" for keepers. Empty = happy anywhere. */
  positions: string[];
}

export interface Formation {
  id: string;
  name: string;
  /** Slot labels. Slot 0 is always the goalkeeper. */
  slots: string[];
}

export interface PeriodPreset {
  id: string;
  name: string;
  /** Period lengths (minutes) for each half. */
  halves: number[][];
}

export interface Fixture {
  date: string;
  /** Our team's name. */
  teamName: string;
  opponent: string;
  venue: 'home' | 'away' | '';
  formationId: string;
  /** Period lengths (minutes) for each half. Substitutions happen between periods. */
  halves: number[][];
  /** Players selected for this fixture, in squad order. */
  available: PlayerId[];
  /** Goalkeeper for each half (null = let the scheduler leave it empty). */
  keepers: (PlayerId | null)[];
}

/** One period of the match, flattened from the halves. */
export interface Period {
  index: number;
  half: number;
  start: number;
  duration: number;
}

/** schedule[period][slot] = player on the pitch in that slot (null if unfilled). */
export type Schedule = (PlayerId | null)[][];

/**
 * Locked cells mapped to the player held there. Pitch cells are keyed `${period}:${slot}`;
 * players held on the bench are keyed `${period}:sub:${playerId}`.
 */
export type Locks = Record<string, PlayerId>;

/** "Team vs Opponent", falling back to whichever part is filled in. */
export function fixtureTitle({ teamName, opponent }: Pick<Fixture, 'teamName' | 'opponent'>): string {
  const team = teamName?.trim();
  const opp = opponent?.trim();
  if (team && opp) return `${team} vs ${opp}`;
  if (opp) return `vs ${opp}`;
  return team || 'Next fixture';
}

export const lockKey = (period: number, slot: number) => `${period}:${slot}`;
export const benchKey = (period: number, player: PlayerId) => `${period}:sub:${player}`;

export function parseLockKey(key: string): { period: number; slot: number | null } {
  const [period, slot] = key.split(':');
  return { period: Number(period), slot: slot === 'sub' ? null : Number(slot) };
}
