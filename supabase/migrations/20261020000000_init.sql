-- Teamsheeter schema: clubs → teams → seasons → matches, with per-team access.
--
-- Access is granted per team (team_members), never per club. Club admins can create teams
-- and manage members/invites, but see no team data unless they are also a team member.
-- Every team data table carries team_id so policies are a single function call, and
-- composite foreign keys on (id, team_id) stop rows referencing another team's players.

-- ─── Types ──────────────────────────────────────────────────────────────────

create type member_role as enum ('coach', 'parent');
create type match_status as enum ('fixture', 'played', 'postponed');
create type match_side as enum ('home', 'away', 'neutral');
create type goal_side as enum ('for', 'against');

-- ─── People and access ─────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  badge_url text,
  colours text,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- user_id references profiles (not auth.users directly) so the API can embed member profiles.
create table club_admins (
  club_id uuid not null references clubs on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs on delete cascade,
  name text not null check (length(trim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (club_id, slug)
);

-- One role per person per team; a person can be in any number of teams at any clubs.
create table team_members (
  team_id uuid not null references teams on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on team_members (user_id);

-- team_id null = invite to become a club admin.
create table invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs on delete cascade,
  team_id uuid references teams on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  role text not null check (role in ('admin', 'coach', 'parent')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users on delete set null,
  check ((team_id is null) = (role = 'admin'))
);

-- ─── Team data ──────────────────────────────────────────────────────────────

create table seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  label text not null check (length(trim(label)) > 0), -- e.g. 2026/27
  age_group text not null default '',                  -- e.g. U13
  format text not null default '',                     -- e.g. 9v9
  created_at timestamptz not null default now(),
  unique (team_id, label),
  unique (id, team_id)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null check (length(trim(name)) > 0),
  dob date,
  -- Preferred positions, e.g. {CB,CM}. Include GK for keepers. Empty = happy anywhere.
  positions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, team_id)
);

create table season_squads (
  season_id uuid not null,
  player_id uuid not null,
  team_id uuid not null,
  -- Per-season override of players.positions (null = use the player's defaults).
  positions text[],
  shirt_no int,
  sort_order int not null default 0,
  primary key (season_id, player_id),
  foreign key (season_id, team_id) references seasons (id, team_id) on delete cascade,
  foreign key (player_id, team_id) references players (id, team_id) on delete cascade
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  season_id uuid not null,
  date date not null,
  kickoff time,
  opponent text not null default '',
  competition text not null default '',
  side match_side,
  venue text not null default '',
  surface text not null default '',
  duration_minutes numeric not null default 60 check (duration_minutes > 0),
  goals_for int check (goals_for >= 0),
  goals_against int check (goals_against >= 0),
  captain_id uuid,
  potm_id uuid,
  referee text not null default '',
  report text not null default '',
  status match_status not null default 'fixture',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, team_id),
  foreign key (season_id, team_id) references seasons (id, team_id) on delete cascade,
  foreign key (captain_id, team_id) references players (id, team_id),
  foreign key (potm_id, team_id) references players (id, team_id)
);
create index matches_season_date_idx on matches (season_id, date);

-- The generated team sheet for a fixture (the existing Teamsheeter state, minus the squad).
create table team_sheets (
  match_id uuid primary key,
  team_id uuid not null,
  formation_id text not null,
  halves jsonb not null,            -- number[][] period lengths per half
  keepers jsonb not null,           -- (player id | null)[] per half
  available uuid[] not null default '{}',
  schedule jsonb,                   -- (player id | null)[period][slot]
  locks jsonb not null default '{}',
  seed int not null default 1,
  updated_by uuid references auth.users on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  foreign key (match_id, team_id) references matches (id, team_id) on delete cascade
);

-- One row per player per match (the spreadsheet's Data Entry tab).
create table match_player_stats (
  match_id uuid not null,
  player_id uuid not null,
  team_id uuid not null,
  available boolean not null default true,
  minutes jsonb not null default '{}', -- minutes by position, e.g. {"GK": 10, "CB": 30}
  saves int not null default 0 check (saves >= 0),
  shots int not null default 0 check (shots >= 0),
  shots_on_target int not null default 0 check (shots_on_target >= 0),
  assists int not null default 0 check (assists >= 0),
  goals int not null default 0 check (goals >= 0),
  goals_for_on_pitch int not null default 0 check (goals_for_on_pitch >= 0),
  goals_against_on_pitch int not null default 0 check (goals_against_on_pitch >= 0),
  primary key (match_id, player_id),
  foreign key (match_id, team_id) references matches (id, team_id) on delete cascade,
  foreign key (player_id, team_id) references players (id, team_id) on delete cascade
);

create table match_goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  team_id uuid not null,
  side goal_side not null,
  minute numeric check (minute >= 0),
  scorer_id uuid,
  assist_id uuid,
  own_goal boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (match_id, team_id) references matches (id, team_id) on delete cascade,
  foreign key (scorer_id, team_id) references players (id, team_id),
  foreign key (assist_id, team_id) references players (id, team_id)
);

-- Spells with an unchanged back line and the goals conceded (Defence Data Entry tab).
create table defence_spells (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  team_id uuid not null,
  player_ids uuid[] not null check (cardinality(player_ids) > 0),
  minutes numeric not null check (minutes >= 0),
  goals_conceded int not null default 0 check (goals_conceded >= 0),
  foreign key (match_id, team_id) references matches (id, team_id) on delete cascade
);

-- Season totals from before the app (Previous Seasons Data tab).
create table legacy_season_totals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  season_label text not null,
  age_group text not null default '',
  player_name text not null,
  player_id uuid,
  appearances int not null default 0,
  goals int not null default 0,
  assists int not null default 0,
  saves int not null default 0,
  shots int not null default 0,
  shots_on_target int not null default 0,
  ones_and_zeros int, -- the spreadsheet's "1s and 0s" column, kept as recorded
  unique (team_id, season_label, player_name),
  foreign key (player_id, team_id) references players (id, team_id) on delete set null (player_id)
);

-- Arrays can't carry foreign keys, so check player arrays belong to the row's team.
-- The trigger argument names the uuid[] column to check.
create function check_team_players() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from jsonb_array_elements_text(to_jsonb(new) -> tg_argv[0]) as x(id)
    where not exists (select 1 from players p where p.id = x.id::uuid and p.team_id = new.team_id)
  ) then
    raise exception 'player does not belong to this team' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger defence_spells_players before insert or update on defence_spells
  for each row execute function check_team_players('player_ids');
create trigger team_sheets_players before insert or update on team_sheets
  for each row execute function check_team_players('available');

create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger matches_touch before update on matches for each row execute function touch_updated_at();
create trigger team_sheets_touch before update on team_sheets for each row execute function touch_updated_at();

-- ─── Access helpers ─────────────────────────────────────────────────────────
-- security definer so policies can read membership without recursing through RLS.

create function can_view(team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = team and user_id = auth.uid());
$$;

create function can_edit(team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members where team_id = team and user_id = auth.uid() and role = 'coach'
  );
$$;

create function can_manage(club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_admins where club_id = club and user_id = auth.uid());
$$;

create function club_of(team uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select club_id from teams where id = team;
$$;

-- In the club at all: an admin, or a member of any of its teams. Lets people see the club's name.
create function in_club(club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage(club) or exists (
    select 1 from team_members m join teams t on t.id = m.team_id
    where t.club_id = club and m.user_id = auth.uid()
  );
$$;

-- People can see the profiles of those they share a team with, plus members of clubs they manage.
create function can_see_profile(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select person = auth.uid()
    or exists (
      select 1 from team_members m
      where m.user_id = person and (can_view(m.team_id) or can_manage(club_of(m.team_id)))
    )
    or exists (select 1 from club_admins a where a.user_id = person and can_manage(a.club_id));
$$;

-- ─── Row-level security ─────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table clubs enable row level security;
alter table club_admins enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table invites enable row level security;

create policy "see shared profiles" on profiles for select to authenticated using (can_see_profile(id));
create policy "edit own profile" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Clubs are created through create_club() so the creator becomes admin atomically.
create policy "see own clubs" on clubs for select to authenticated using (in_club(id));
create policy "admins edit club" on clubs for update to authenticated
  using (can_manage(id)) with check (can_manage(id));
create policy "admins delete club" on clubs for delete to authenticated using (can_manage(id));

create policy "see club admins" on club_admins for select to authenticated using (in_club(club_id));
create policy "admins add admins" on club_admins for insert to authenticated with check (can_manage(club_id));
create policy "admins remove admins" on club_admins for delete to authenticated using (can_manage(club_id));

create policy "see own teams" on teams for select to authenticated
  using (can_view(id) or can_manage(club_id));
create policy "admins create teams" on teams for insert to authenticated with check (can_manage(club_id));
create policy "admins and coaches edit team" on teams for update to authenticated
  using (can_manage(club_id) or can_edit(id)) with check (can_manage(club_id) or can_edit(id));
create policy "admins delete teams" on teams for delete to authenticated using (can_manage(club_id));

-- New members arrive through accept_invite(); admins may also add members directly (e.g. themselves).
create policy "see team members" on team_members for select to authenticated
  using (can_view(team_id) or can_manage(club_of(team_id)));
create policy "admins add members" on team_members for insert to authenticated
  with check (can_manage(club_of(team_id)));
create policy "admins and coaches change roles" on team_members for update to authenticated
  using (can_manage(club_of(team_id)) or can_edit(team_id))
  with check (can_manage(club_of(team_id)) or can_edit(team_id));
create policy "admins and coaches remove members, anyone leaves" on team_members for delete to authenticated
  using (can_manage(club_of(team_id)) or can_edit(team_id) or user_id = auth.uid());

create policy "see invites you can manage" on invites for select to authenticated
  using (can_manage(club_id) or (team_id is not null and can_edit(team_id)));
create policy "create invites" on invites for insert to authenticated
  with check (
    accepted_at is null and (
      (team_id is null and can_manage(club_id))
      or (team_id is not null and club_of(team_id) = club_id and (can_manage(club_id) or can_edit(team_id)))
    )
  );
create policy "revoke invites" on invites for delete to authenticated
  using (can_manage(club_id) or (team_id is not null and can_edit(team_id)));

-- Team data: members read, coaches write. Same four policies on every table.
do $$
declare t text;
begin
  foreach t in array array[
    'seasons', 'players', 'season_squads', 'matches', 'team_sheets',
    'match_player_stats', 'match_goals', 'defence_spells', 'legacy_season_totals'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "members read" on %I for select to authenticated using (can_view(team_id))', t);
    execute format('create policy "coaches insert" on %I for insert to authenticated with check (can_edit(team_id))', t);
    execute format('create policy "coaches update" on %I for update to authenticated using (can_edit(team_id)) with check (can_edit(team_id))', t);
    execute format('create policy "coaches delete" on %I for delete to authenticated using (can_edit(team_id))', t);
  end loop;
end $$;

-- ─── Functions called by the app ────────────────────────────────────────────

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function create_club(club_name text, club_slug text) returns clubs
language plpgsql security definer set search_path = public as $$
declare c clubs;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  -- These are app routes (/login, /invite/…), so can't be club addresses.
  if club_slug in ('login', 'invite', 'clubs', 'local', 'auth', 'api', 'settings', 'admin') then
    raise exception 'that web address is reserved' using errcode = '23514';
  end if;
  insert into clubs (name, slug, created_by) values (club_name, club_slug, auth.uid()) returning * into c;
  insert into club_admins (club_id, user_id) values (c.id, auth.uid());
  return c;
end $$;

-- What an invite link is for, so the accept page can describe it before sign-in.
create function invite_details(invite_token uuid)
returns table (club_name text, team_name text, role text, email text, expired boolean, accepted boolean)
language sql stable security definer set search_path = public as $$
  select c.name, t.name, i.role, i.email, i.expires_at < now(), i.accepted_at is not null
  from invites i join clubs c on c.id = i.club_id left join teams t on t.id = i.team_id
  where i.token = invite_token;
$$;

-- Accept an invite sent to the signed-in user's email. Never downgrades a coach to parent.
create function accept_invite(invite_token uuid)
returns table (club_slug text, team_slug text)
language plpgsql security definer set search_path = public as $$
declare
  i invites;
  me uuid := auth.uid();
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into i from invites where token = invite_token for update;
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
  if i.accepted_at is not null then raise exception 'invite already used' using errcode = '22023'; end if;
  if i.expires_at < now() then raise exception 'invite has expired' using errcode = '22023'; end if;
  if lower(i.email) <> my_email then
    raise exception 'this invite was sent to a different email address' using errcode = '42501';
  end if;

  if i.team_id is null then
    insert into club_admins (club_id, user_id) values (i.club_id, me) on conflict do nothing;
  else
    insert into team_members (team_id, user_id, role) values (i.team_id, me, i.role::member_role)
    on conflict (team_id, user_id) do update
      set role = case when team_members.role = 'coach' then 'coach'::member_role else excluded.role end;
  end if;
  update invites set accepted_at = now(), accepted_by = me where id = i.id;

  return query
    select c.slug, t.slug from clubs c left join teams t on t.id = i.team_id where c.id = i.club_id;
end $$;

-- The callers' own memberships, for the team switcher.
create function my_teams()
returns table (club_id uuid, club_name text, club_slug text, team_id uuid, team_name text, team_slug text, role text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.slug, t.id, t.name, t.slug, m.role::text
  from team_members m join teams t on t.id = m.team_id join clubs c on c.id = t.club_id
  where m.user_id = auth.uid() and t.archived_at is null
  order by c.name, t.name;
$$;

revoke execute on function create_club, accept_invite, invite_details, my_teams from public, anon;
grant execute on function create_club, accept_invite, invite_details, my_teams to authenticated;

-- ─── Views (replace the spreadsheet's pivot tables) ─────────────────────────
-- security_invoker makes RLS apply to whoever queries the view.

create function jsonb_sum(obj jsonb) returns numeric
language sql immutable as $$
  select coalesce(sum(value::numeric), 0) from jsonb_each_text(obj);
$$;

create view v_player_match with (security_invoker = true) as
select
  s.team_id, m.season_id, s.match_id, m.date, m.opponent, m.competition, s.player_id,
  s.available,
  case when s.available then m.duration_minutes else 0 end as available_minutes,
  jsonb_sum(s.minutes) as minutes,
  coalesce((s.minutes ->> 'GK')::numeric, 0) as gk_minutes,
  jsonb_sum(s.minutes) - coalesce((s.minutes ->> 'GK')::numeric, 0) as outfield_minutes,
  s.minutes as minutes_by_position,
  (m.captain_id = s.player_id) is true as captain,
  (m.potm_id = s.player_id) is true as potm,
  s.saves, s.shots, s.shots_on_target, s.assists, s.goals,
  s.goals_for_on_pitch, s.goals_against_on_pitch
from match_player_stats s
join matches m on m.id = s.match_id
where m.status = 'played';

create view v_player_season_totals with (security_invoker = true) as
select
  pm.team_id, pm.season_id, pm.player_id, p.name as player_name,
  count(*) filter (where pm.minutes > 0)::int as appearances,
  sum(pm.available_minutes) as available_minutes,
  sum(pm.minutes) as minutes,
  sum(pm.gk_minutes) as gk_minutes,
  sum(pm.outfield_minutes) as outfield_minutes,
  coalesce((
    select jsonb_object_agg(k, v) from (
      select e.key as k, sum(e.value::numeric) as v
      from v_player_match x, jsonb_each_text(x.minutes_by_position) e
      where x.season_id = pm.season_id and x.player_id = pm.player_id
      group by e.key
    ) agg
  ), '{}') as minutes_by_position,
  count(*) filter (where pm.captain)::int as captaincies,
  count(*) filter (where pm.potm)::int as potm,
  sum(pm.saves)::int as saves,
  sum(pm.shots)::int as shots,
  sum(pm.shots_on_target)::int as shots_on_target,
  sum(pm.assists)::int as assists,
  sum(pm.goals)::int as goals,
  sum(pm.goals_for_on_pitch)::int as goals_for_on_pitch,
  sum(pm.goals_against_on_pitch)::int as goals_against_on_pitch
from v_player_match pm
join players p on p.id = pm.player_id
group by pm.team_id, pm.season_id, pm.player_id, p.name;

create view v_season_summary with (security_invoker = true) as
select
  m.team_id, m.season_id,
  count(*)::int as played,
  count(*) filter (where m.goals_for > m.goals_against)::int as won,
  count(*) filter (where m.goals_for = m.goals_against)::int as drawn,
  count(*) filter (where m.goals_for < m.goals_against)::int as lost,
  coalesce(sum(m.goals_for), 0)::int as goals_for,
  coalesce(sum(m.goals_against), 0)::int as goals_against,
  count(*) filter (where m.goals_against = 0)::int as clean_sheets
from matches m
where m.status = 'played' and m.goals_for is not null and m.goals_against is not null
group by m.team_id, m.season_id;

create view v_defence_combos with (security_invoker = true) as
select
  d.team_id, m.season_id,
  (select array_agg(x order by x) from unnest(d.player_ids) x) as player_ids,
  count(distinct d.match_id)::int as matches,
  sum(d.minutes) as minutes,
  sum(d.goals_conceded)::int as goals_conceded,
  case when sum(d.minutes) > 0 then round(sum(d.goals_conceded) * 60 / sum(d.minutes), 2) end as conceded_per_60
from defence_spells d
join matches m on m.id = d.match_id
group by d.team_id, m.season_id, 3;

-- Every player-season the team has: app seasons plus the pre-app totals.
create view v_player_seasons_all with (security_invoker = true) as
select
  t.team_id, s.label as season_label, s.age_group, t.player_id, t.player_name,
  t.appearances, t.goals, t.assists, t.saves, t.shots, t.shots_on_target, false as legacy
from v_player_season_totals t
join seasons s on s.id = t.season_id
union all
select
  l.team_id, l.season_label, l.age_group, l.player_id, l.player_name,
  l.appearances, l.goals, l.assists, l.saves, l.shots, l.shots_on_target, true
from legacy_season_totals l;

-- ─── Grants ─────────────────────────────────────────────────────────────────

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
