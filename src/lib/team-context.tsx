import { createContext, useContext } from 'react';
import type { MyTeam, Season } from './db-types';

export interface TeamContextValue {
  /** The user's membership of this team (club and team names, slugs and role). */
  membership: MyTeam;
  teamId: string;
  canEdit: boolean;
  seasons: Season[];
  season: Season | null;
  setSeasonId: (id: string) => void;
  /** Link within this team, e.g. path('fixtures'). */
  path: (sub?: string) => string;
}

export const TeamContext = createContext<TeamContextValue | null>(null);

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used inside a team route');
  return ctx;
}
