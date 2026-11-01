// Row shapes for the tables and views in supabase/migrations. Keep in step with the SQL.

export type Role = 'coach' | 'parent';
export type MatchStatus = 'fixture' | 'played' | 'postponed';
export type MatchSide = 'home' | 'away' | 'neutral';

export interface Club {
  id: string;
  name: string;
  slug: string;
  badge_url: string | null;
  colours: string | null;
}

export interface Team {
  id: string;
  club_id: string;
  name: string;
  slug: string;
  archived_at: string | null;
}

/** A row of my_teams(): one per team the signed-in user belongs to. */
export interface MyTeam {
  club_id: string;
  club_name: string;
  club_slug: string;
  team_id: string;
  team_name: string;
  team_slug: string;
  role: Role;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: Role;
  profiles: Profile | null;
}

export interface Invite {
  id: string;
  club_id: string;
  team_id: string | null;
  email: string;
  role: 'admin' | Role;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface Season {
  id: string;
  team_id: string;
  label: string;
  age_group: string;
  format: string;
}

export interface PlayerRow {
  id: string;
  team_id: string;
  name: string;
  dob: string | null;
  positions: string[];
  active: boolean;
}

export interface SquadRow {
  season_id: string;
  player_id: string;
  team_id: string;
  positions: string[] | null;
  shirt_no: number | null;
  sort_order: number;
}

export interface Match {
  id: string;
  team_id: string;
  season_id: string;
  date: string;
  kickoff: string | null;
  opponent: string;
  competition: string;
  side: MatchSide | null;
  venue: string;
  surface: string;
  duration_minutes: number;
  goals_for: number | null;
  goals_against: number | null;
  captain_id: string | null;
  potm_id: string | null;
  referee: string;
  report: string;
  status: MatchStatus;
  updated_at: string;
}

export interface TeamSheetRow {
  match_id: string;
  team_id: string;
  formation_id: string;
  halves: number[][];
  keepers: (string | null)[];
  available: string[];
  schedule: (string | null)[][] | null;
  locks: Record<string, string>;
  seed: number;
  updated_at: string;
}

export interface PlayerStatsRow {
  match_id: string;
  player_id: string;
  team_id: string;
  available: boolean;
  minutes: Record<string, number>;
  saves: number;
  shots: number;
  shots_on_target: number;
  assists: number;
  goals: number;
  goals_for_on_pitch: number;
  goals_against_on_pitch: number;
}

export interface MatchGoal {
  id: string;
  match_id: string;
  team_id: string;
  side: 'for' | 'against';
  minute: number | null;
  scorer_id: string | null;
  assist_id: string | null;
  own_goal: boolean;
  note: string;
}

export interface DefenceSpell {
  id: string;
  match_id: string;
  team_id: string;
  player_ids: string[];
  minutes: number;
  goals_conceded: number;
}

export interface PlayerSeasonTotals {
  team_id: string;
  season_id: string;
  player_id: string;
  player_name: string;
  appearances: number;
  available_minutes: number;
  minutes: number;
  gk_minutes: number;
  outfield_minutes: number;
  minutes_by_position: Record<string, number>;
  captaincies: number;
  potm: number;
  saves: number;
  shots: number;
  shots_on_target: number;
  assists: number;
  goals: number;
  goals_for_on_pitch: number;
  goals_against_on_pitch: number;
}

export interface SeasonSummary {
  team_id: string;
  season_id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  clean_sheets: number;
}

export interface DefenceCombo {
  team_id: string;
  season_id: string;
  player_ids: string[];
  matches: number;
  minutes: number;
  goals_conceded: number;
  conceded_per_60: number | null;
}

export interface PlayerSeasonAll {
  team_id: string;
  season_label: string;
  age_group: string;
  player_id: string | null;
  player_name: string;
  appearances: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  shots_on_target: number;
  legacy: boolean;
}

/** Per player per played match (v_player_match). */
export interface PlayerMatchRow {
  team_id: string;
  season_id: string;
  match_id: string;
  date: string;
  opponent: string;
  competition: string;
  player_id: string;
  available: boolean;
  available_minutes: number;
  minutes: number;
  gk_minutes: number;
  outfield_minutes: number;
  minutes_by_position: Record<string, number>;
  captain: boolean;
  potm: boolean;
  saves: number;
  shots: number;
  shots_on_target: number;
  assists: number;
  goals: number;
  goals_for_on_pitch: number;
  goals_against_on_pitch: number;
}
