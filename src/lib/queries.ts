import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { db, must } from './supabase';
import type {
  Club,
  DefenceCombo,
  DefenceSpell,
  Invite,
  Match,
  MatchGoal,
  MyTeam,
  PlayerMatchRow,
  PlayerRow,
  PlayerSeasonAll,
  PlayerSeasonTotals,
  PlayerStatsRow,
  Season,
  SeasonSummary,
  SquadRow,
  Team,
  TeamMember,
  TeamSheetRow,
} from './db-types';

// ─── Reads ──────────────────────────────────────────────────────────────────

export const useMyTeams = () =>
  useQuery({ queryKey: ['myTeams'], queryFn: async () => must(await db().rpc('my_teams')) as MyTeam[] });

/** Clubs the user can see (admin of, or member of a team at). */
export const useMyClubs = () =>
  useQuery({
    queryKey: ['clubs'],
    queryFn: async () => must(await db().from('clubs').select('id, name, slug, badge_url, colours').order('name')) as Club[],
  });

export const useAdminClubIds = (userId: string | undefined) =>
  useQuery({
    queryKey: ['adminClubs', userId],
    enabled: !!userId,
    queryFn: async () =>
      (must(await db().from('club_admins').select('club_id').eq('user_id', userId!)) as { club_id: string }[]).map((r) => r.club_id),
  });

export const useClub = (slug: string | undefined) =>
  useQuery({
    queryKey: ['club', slug],
    enabled: !!slug,
    queryFn: async () => must(await db().from('clubs').select('*').eq('slug', slug!).maybeSingle()) as Club | null,
  });

export const useClubTeams = (clubId: string | undefined) =>
  useQuery({
    queryKey: ['clubTeams', clubId],
    enabled: !!clubId,
    queryFn: async () => must(await db().from('teams').select('*').eq('club_id', clubId!).order('name')) as Team[],
  });

export const useSeasons = (teamId: string | undefined) =>
  useQuery({
    queryKey: ['seasons', teamId],
    enabled: !!teamId,
    queryFn: async () => must(await db().from('seasons').select('*').eq('team_id', teamId!).order('sort_order').order('label', { ascending: false })) as Season[],
  });

export const usePlayers = (teamId: string | undefined) =>
  useQuery({
    queryKey: ['players', teamId],
    enabled: !!teamId,
    queryFn: async () => must(await db().from('players').select('*').eq('team_id', teamId!).order('name')) as PlayerRow[],
  });

export interface SquadPlayer {
  id: string;
  name: string;
  /** Season override if set, else the player's own positions. */
  positions: string[];
  player: PlayerRow;
  squad: SquadRow;
}

export const useSquad = (seasonId: string | undefined) =>
  useQuery({
    queryKey: ['squad', seasonId],
    enabled: !!seasonId,
    queryFn: async () => {
      const rows = must(
        await db().from('season_squads').select('*, players(*)').eq('season_id', seasonId!).order('sort_order'),
      ) as (SquadRow & { players: PlayerRow })[];
      return rows.map(({ players, ...squad }): SquadPlayer => ({
        id: players.id,
        name: players.name,
        positions: squad.positions ?? players.positions,
        player: players,
        squad,
      }));
    },
  });

export const useMatches = (seasonId: string | undefined) =>
  useQuery({
    queryKey: ['matches', seasonId],
    enabled: !!seasonId,
    queryFn: async () => must(await db().from('matches').select('*').eq('season_id', seasonId!).order('date').order('kickoff')) as Match[],
  });

/** Number of matches in each of a team's seasons, keyed by season id. */
export const useSeasonMatchCounts = (teamId: string | undefined) =>
  useQuery({
    queryKey: ['seasonMatchCounts', teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const rows = must(await db().from('matches').select('season_id').eq('team_id', teamId!)) as { season_id: string }[];
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.season_id] = (counts[r.season_id] ?? 0) + 1;
      return counts;
    },
  });

export const useMatch = (id: string | undefined) =>
  useQuery({
    queryKey: ['match', id],
    enabled: !!id,
    queryFn: async () => must(await db().from('matches').select('*').eq('id', id!).maybeSingle()) as Match | null,
  });

/** Which matches in a season already have a team sheet. */
export const useSheetIds = (teamId: string | undefined) =>
  useQuery({
    queryKey: ['sheetIds', teamId],
    enabled: !!teamId,
    queryFn: async () =>
      new Set((must(await db().from('team_sheets').select('match_id').eq('team_id', teamId!)) as { match_id: string }[]).map((r) => r.match_id)),
  });

export const useTeamSheet = (matchId: string | undefined) =>
  useQuery({
    queryKey: ['sheet', matchId],
    enabled: !!matchId,
    queryFn: async () => must(await db().from('team_sheets').select('*').eq('match_id', matchId!).maybeSingle()) as TeamSheetRow | null,
  });

/** The team's most recently edited sheet, to start a new one from. */
export async function latestTeamSheet(teamId: string, excludeMatch: string) {
  return must(
    await db().from('team_sheets').select('*').eq('team_id', teamId).neq('match_id', excludeMatch).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ) as TeamSheetRow | null;
}

export const useMatchStats = (matchId: string | undefined) =>
  useQuery({
    queryKey: ['stats', matchId],
    enabled: !!matchId,
    queryFn: async () => must(await db().from('match_player_stats').select('*').eq('match_id', matchId!)) as PlayerStatsRow[],
  });

export const useMatchGoals = (matchId: string | undefined) =>
  useQuery({
    queryKey: ['goals', matchId],
    enabled: !!matchId,
    queryFn: async () =>
      must(await db().from('match_goals').select('*').eq('match_id', matchId!).order('minute', { nullsFirst: false }).order('created_at')) as MatchGoal[],
  });

export const useDefenceSpells = (matchId: string | undefined) =>
  useQuery({
    queryKey: ['spells', matchId],
    enabled: !!matchId,
    queryFn: async () => must(await db().from('defence_spells').select('*').eq('match_id', matchId!)) as DefenceSpell[],
  });

export const useSeasonTotals = (seasonId: string | undefined) =>
  useQuery({
    queryKey: ['seasonTotals', seasonId],
    enabled: !!seasonId,
    queryFn: async () => must(await db().from('v_player_season_totals').select('*').eq('season_id', seasonId!)) as PlayerSeasonTotals[],
  });

export const useSeasonSummary = (seasonId: string | undefined) =>
  useQuery({
    queryKey: ['summary', seasonId],
    enabled: !!seasonId,
    queryFn: async () => must(await db().from('v_season_summary').select('*').eq('season_id', seasonId!).maybeSingle()) as SeasonSummary | null,
  });

export const useDefenceCombos = (seasonId: string | undefined) =>
  useQuery({
    queryKey: ['combos', seasonId],
    enabled: !!seasonId,
    queryFn: async () => must(await db().from('v_defence_combos').select('*').eq('season_id', seasonId!)) as DefenceCombo[],
  });

/** Player-match rows for a season (match filter on the Season page). */
export const useSeasonPlayerMatches = (seasonId: string | undefined) =>
  useQuery({
    queryKey: ['seasonPlayerMatches', seasonId],
    enabled: !!seasonId,
    queryFn: async () => must(await db().from('v_player_match').select('*').eq('season_id', seasonId!)) as PlayerMatchRow[],
  });

export const usePlayerMatches = (playerId: string | undefined) =>
  useQuery({
    queryKey: ['playerMatches', playerId],
    enabled: !!playerId,
    queryFn: async () => must(await db().from('v_player_match').select('*').eq('player_id', playerId!).order('date')) as PlayerMatchRow[],
  });

export const usePlayerSeasonsAll = (teamIds: string[]) =>
  useQuery({
    queryKey: ['playerSeasonsAll', teamIds],
    enabled: teamIds.length > 0,
    queryFn: async () => must(await db().from('v_player_seasons_all').select('*').in('team_id', teamIds)) as PlayerSeasonAll[],
  });

/** Every played match for the given teams, for records. */
export const usePlayedMatches = (teamIds: string[]) =>
  useQuery({
    queryKey: ['playedMatches', teamIds],
    enabled: teamIds.length > 0,
    queryFn: async () =>
      must(await db().from('matches').select('*').in('team_id', teamIds).eq('status', 'played').order('date')) as Match[],
  });

export const useTeamMembers = (teamId: string | undefined) =>
  useQuery({
    queryKey: ['members', teamId],
    enabled: !!teamId,
    queryFn: async () =>
      must(await db().from('team_members').select('team_id, user_id, role, profiles(id, email, display_name)').eq('team_id', teamId!)) as unknown as TeamMember[],
  });

export const useClubAdmins = (clubId: string | undefined) =>
  useQuery({
    queryKey: ['clubAdmins', clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const admins = must(await db().from('club_admins').select('user_id').eq('club_id', clubId!)) as { user_id: string }[];
      const profiles = admins.length
        ? (must(await db().from('profiles').select('id, email, display_name').in('id', admins.map((a) => a.user_id))) as { id: string; email: string; display_name: string }[])
        : [];
      return admins.map((a) => profiles.find((p) => p.id === a.user_id) ?? { id: a.user_id, email: '(hidden)', display_name: '' });
    },
  });

export const useInvites = (filter: { clubId?: string; teamId?: string }) =>
  useQuery({
    queryKey: ['invites', filter],
    enabled: !!(filter.clubId || filter.teamId),
    queryFn: async () => {
      let q = db().from('invites').select('*').is('accepted_at', null).order('created_at', { ascending: false });
      q = filter.teamId ? q.eq('team_id', filter.teamId) : q.eq('club_id', filter.clubId!).is('team_id', null);
      return must(await q) as Invite[];
    },
  });

// ─── Writes ─────────────────────────────────────────────────────────────────

/** A mutation that refreshes the given queries when it succeeds. */
export function useWrite<A, R = unknown>(fn: (args: A) => Promise<R>, invalidate: (args: A) => QueryKey[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, args) => Promise.all(invalidate(args).map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export async function insertRow<T>(table: string, row: Record<string, unknown>): Promise<T> {
  return must(await db().from(table).insert(row).select().single()) as T;
}

export async function updateRow(table: string, match: Record<string, unknown>, patch: Record<string, unknown>) {
  let q = db().from(table).update(patch);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
  must(await q);
}

export async function deleteRows(table: string, match: Record<string, unknown>) {
  let q = db().from(table).delete();
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
  must(await q);
}

/** Player-match rows for several teams, for records. */
export const useTeamsPlayerMatches = (teamIds: string[]) =>
  useQuery({
    queryKey: ['teamsPlayerMatches', teamIds],
    enabled: teamIds.length > 0,
    queryFn: async () => must(await db().from('v_player_match').select('*').in('team_id', teamIds)) as PlayerMatchRow[],
  });

/** Players for several teams (names for records). */
export const useTeamsPlayers = (teamIds: string[]) =>
  useQuery({
    queryKey: ['teamsPlayers', teamIds],
    enabled: teamIds.length > 0,
    queryFn: async () => must(await db().from('players').select('*').in('team_id', teamIds)) as PlayerRow[],
  });
