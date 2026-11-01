import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, createUser, type Db, type Tx } from './db';

type User = { id: string; email: string };

let db: Db;
const u: Record<'alice' | 'bob' | 'carol' | 'dave' | 'erin' | 'frank', User> = {} as never;
const ids: Record<string, string> = {};

const one = async <T>(tx: Tx, sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows[0];
const count = async (tx: Tx, table: string) =>
  Number((await tx.query<{ n: string }>(`select count(*) as n from ${table}`)).rows[0].n);

/** Invite someone and have them accept it, as a real user would. */
async function invite(from: User, to: User, clubId: string, teamId: string | null, role: string) {
  const { token } = await as(db, from, (tx) =>
    one<{ token: string }>(tx, 'insert into invites (club_id, team_id, email, role) values ($1, $2, $3, $4) returning token', [
      clubId,
      teamId,
      to.email,
      role,
    ]),
  );
  await as(db, to, (tx) => tx.query('select * from accept_invite($1)', [token]));
  return token;
}

/** A small team: a season, two players, one played match with stats. */
async function seedTeamData(coach: User, teamId: string, prefix: string) {
  return as(db, coach, async (tx) => {
    const season = await one<{ id: string }>(tx, `insert into seasons (team_id, label, age_group) values ($1, '2026/27', 'U13') returning id`, [teamId]);
    const p1 = await one<{ id: string }>(tx, `insert into players (team_id, name, positions) values ($1, $2, '{GK}') returning id`, [teamId, `${prefix} Keeper`]);
    const p2 = await one<{ id: string }>(tx, `insert into players (team_id, name, positions) values ($1, $2, '{CB,CM}') returning id`, [teamId, `${prefix} Defender`]);
    const match = await one<{ id: string }>(
      tx,
      `insert into matches (team_id, season_id, date, opponent, goals_for, goals_against, status, captain_id, potm_id)
       values ($1, $2, '2026-09-06', 'Rivals', 2, 1, 'played', $3, $4) returning id`,
      [teamId, season.id, p2.id, p1.id],
    );
    await tx.query(`insert into season_squads (season_id, player_id, team_id) values ($1, $2, $4), ($1, $3, $4)`, [season.id, p1.id, p2.id, teamId]);
    await tx.query(
      `insert into match_player_stats (match_id, player_id, team_id, minutes, saves, goals) values
         ($1, $2, $4, '{"GK": 60}', 7, 0),
         ($1, $3, $4, '{"CB": 30, "CM": 20}', 0, 2)`,
      [match.id, p1.id, p2.id, teamId],
    );
    await tx.query(
      `insert into team_sheets (match_id, team_id, formation_id, halves, keepers, available)
       values ($1, $2, '9-323', '[[30],[30]]', $3, $4)`,
      [match.id, teamId, JSON.stringify([p1.id, p1.id]), [p1.id, p2.id]],
    );
    await tx.query(`insert into defence_spells (match_id, team_id, player_ids, minutes, goals_conceded) values ($1, $2, $3, 30, 1)`, [
      match.id,
      teamId,
      [p2.id],
    ]);
    return { season: season.id, keeper: p1.id, defender: p2.id, match: match.id };
  });
}

beforeAll(async () => {
  db = await createDb();
  for (const name of ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'] as const) {
    const email = `${name}@example.com`;
    u[name] = { id: await createUser(db, email), email };
  }

  // Club 1 (alice is admin): teams A and B. Club 2 (frank is admin): team C.
  ids.club1 = (await as(db, u.alice, (tx) => one<{ id: string }>(tx, `select id from create_club('Appley Bridge', 'appley-bridge')`))).id;
  ids.club2 = (await as(db, u.frank, (tx) => one<{ id: string }>(tx, `select id from create_club('Other FC', 'other-fc')`))).id;
  await as(db, u.alice, async (tx) => {
    ids.teamA = (await one<{ id: string }>(tx, `insert into teams (club_id, name, slug) values ($1, 'U13s', 'u13') returning id`, [ids.club1])).id;
    ids.teamB = (await one<{ id: string }>(tx, `insert into teams (club_id, name, slug) values ($1, 'U9s', 'u9') returning id`, [ids.club1])).id;
    // The admin also coaches team A, so gives themselves a membership.
    await tx.query(`insert into team_members (team_id, user_id, role) values ($1, $2, 'coach')`, [ids.teamA, u.alice.id]);
  });
  await as(db, u.frank, async (tx) => {
    ids.teamC = (await one<{ id: string }>(tx, `insert into teams (club_id, name, slug) values ($1, 'U11s', 'u11') returning id`, [ids.club2])).id;
    await tx.query(`insert into team_members (team_id, user_id, role) values ($1, $2, 'coach')`, [ids.teamC, u.frank.id]);
  });

  await invite(u.alice, u.bob, ids.club1, ids.teamB, 'coach'); // bob: coach of B only
  await invite(u.alice, u.carol, ids.club1, ids.teamA, 'coach'); // carol: coach of A at club 1…
  await invite(u.frank, u.carol, ids.club2, ids.teamC, 'parent'); // …and parent at club 2's C
  await invite(u.carol, u.dave, ids.club1, ids.teamA, 'parent'); // dave: parent of A (invited by a coach)
  await invite(u.alice, u.erin, ids.club1, null, 'admin'); // erin: club 1 admin, no teams

  const a = await seedTeamData(u.carol, ids.teamA, 'A');
  const b = await seedTeamData(u.bob, ids.teamB, 'B');
  const c = await seedTeamData(u.frank, ids.teamC, 'C');
  Object.assign(ids, { matchA: a.match, playerA: a.defender, seasonA: a.season, playerB: b.defender, matchC: c.match, playerC: c.defender });
}, 60_000);

const TEAM_DATA = ['seasons', 'players', 'season_squads', 'matches', 'team_sheets', 'match_player_stats', 'defence_spells'];

describe('coach of team A', () => {
  it('reads and edits team A', async () => {
    await as(db, u.bob, async () => {}); // warm-up: other users' sessions don't leak
    await as(db, u.carol, async (tx) => {
      const players = await tx.query<{ team_id: string }>(`select team_id from players`);
      expect(new Set(players.rows.map((r) => r.team_id))).toEqual(new Set([ids.teamA, ids.teamC]));
      await tx.query(`insert into players (team_id, name) values ($1, 'New kid')`, [ids.teamA]);
      const upd = await tx.query(`update matches set report = 'Great game' where id = $1`, [ids.matchA]);
      expect(upd.affectedRows).toBe(1);
    });
  });

  it("can't see or edit team B at the same club", async () => {
    await as(db, u.carol, async (tx) => {
      for (const t of TEAM_DATA) {
        const { rows } = await tx.query(`select 1 from ${t} where team_id = $1`, [ids.teamB]);
        expect(rows, t).toHaveLength(0);
      }
      const teams = await tx.query<{ id: string }>(`select id from teams`);
      expect(teams.rows.map((r) => r.id)).not.toContain(ids.teamB);
    });
    await expect(
      as(db, u.carol, (tx) => tx.query(`insert into players (team_id, name) values ($1, 'Sneaky')`, [ids.teamB])),
    ).rejects.toThrow(/row-level security/);
  });

  it('is read-only on team C where they are a parent', async () => {
    await as(db, u.carol, async (tx) => {
      expect((await tx.query(`select 1 from matches where team_id = $1`, [ids.teamC])).rows).toHaveLength(1);
      const upd = await tx.query(`update matches set report = 'x' where team_id = $1`, [ids.teamC]);
      expect(upd.affectedRows).toBe(0);
      const del = await tx.query(`delete from players where team_id = $1`, [ids.teamC]);
      expect(del.affectedRows).toBe(0);
    });
    await expect(
      as(db, u.carol, (tx) => tx.query(`insert into match_goals (match_id, team_id, side) values ($1, $2, 'for')`, [ids.matchC, ids.teamC])),
    ).rejects.toThrow(/row-level security/);
  });

  it('lists exactly their own teams with roles', async () => {
    const rows = await as(db, u.carol, async (tx) => (await tx.query<{ team_id: string; role: string }>(`select team_id, role from my_teams()`)).rows);
    expect(rows.map((r) => [r.team_id, r.role]).sort()).toEqual([[ids.teamA, 'coach'], [ids.teamC, 'parent']].sort());
  });
});

describe('parent of team A', () => {
  it('reads team A but cannot change it', async () => {
    await as(db, u.dave, async (tx) => {
      for (const t of TEAM_DATA) expect(await count(tx, t), t).toBeGreaterThan(0);
      expect((await tx.query(`update matches set report = 'x'`)).affectedRows).toBe(0);
      expect((await tx.query(`delete from match_player_stats`)).affectedRows).toBe(0);
      expect((await tx.query(`update team_sheets set seed = 99`)).affectedRows).toBe(0);
    });
    await expect(as(db, u.dave, (tx) => tx.query(`insert into seasons (team_id, label) values ($1, '2027/28')`, [ids.teamA]))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("gets nothing from the club's other teams or other clubs", async () => {
    await as(db, u.dave, async (tx) => {
      for (const t of TEAM_DATA) {
        const { rows } = await tx.query(`select 1 from ${t} where team_id <> $1`, [ids.teamA]);
        expect(rows, t).toHaveLength(0);
      }
      expect((await tx.query(`select id from teams`)).rows).toEqual([{ id: ids.teamA }]);
      expect((await tx.query(`select id from clubs`)).rows).toEqual([{ id: ids.club1 }]);
    });
  });

  it('cannot invite people', async () => {
    await expect(
      as(db, u.dave, (tx) =>
        tx.query(`insert into invites (club_id, team_id, email, role) values ($1, $2, 'x@example.com', 'parent')`, [ids.club1, ids.teamA]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('club admin who is not in any team', () => {
  it('can create teams and manage members and invites', async () => {
    await as(db, u.erin, async (tx) => {
      expect(await count(tx, 'teams')).toBe(2); // sees both club 1 teams…
      const t = await one<{ id: string }>(tx, `insert into teams (club_id, name, slug) values ($1, 'U15s', 'u15') returning id`, [ids.club1]);
      await tx.query(`insert into invites (club_id, team_id, email, role) values ($1, $2, 'coach@example.com', 'coach')`, [ids.club1, t.id]);
      expect(await count(tx, 'team_members')).toBeGreaterThan(0); // …and who is in them
      const upd = await tx.query(`update team_members set role = 'coach' where team_id = $1 and user_id = $2`, [ids.teamA, u.dave.id]);
      expect(upd.affectedRows).toBe(1);
      throw new Rollback();
    }).catch(ignoreRollback);
  });

  it('reads no team data', async () => {
    await as(db, u.erin, async (tx) => {
      for (const t of [...TEAM_DATA, 'v_player_season_totals', 'v_season_summary', 'v_defence_combos', 'v_player_seasons_all']) {
        expect(await count(tx, t), t).toBe(0);
      }
      expect((await tx.query(`update matches set report = 'x'`)).affectedRows).toBe(0);
    });
  });

  it('cannot manage another club', async () => {
    await expect(
      as(db, u.erin, (tx) => tx.query(`insert into teams (club_id, name, slug) values ($1, 'Hijack', 'hijack')`, [ids.club2])),
    ).rejects.toThrow(/row-level security/);
    await as(db, u.erin, async (tx) => {
      expect((await tx.query(`select 1 from teams where club_id = $1`, [ids.club2])).rows).toHaveLength(0);
      expect((await tx.query(`delete from team_members where team_id = $1`, [ids.teamC])).affectedRows).toBe(0);
    });
  });
});

describe('not signed in', () => {
  it('can read nothing', async () => {
    for (const t of ['clubs', 'teams', ...TEAM_DATA]) {
      await expect(as(db, null, (tx) => tx.query(`select * from ${t}`)), t).rejects.toThrow(/permission denied/);
    }
    await expect(as(db, null, (tx) => tx.query(`select * from my_teams()`))).rejects.toThrow(/permission denied/);
  });
});

describe('cross-team references', () => {
  // Run as the database owner, so only constraints (not RLS) can stop these.
  it("rejects another team's player in a squad, stats, captaincy, sheet or back line", async () => {
    const cases: [string, unknown[]][] = [
      [`insert into season_squads (season_id, player_id, team_id) values ($1, $2, $3)`, [ids.seasonA, ids.playerB, ids.teamA]],
      [`insert into season_squads (season_id, player_id, team_id) values ($1, $2, $3)`, [ids.seasonA, ids.playerB, ids.teamB]],
      [`insert into match_player_stats (match_id, player_id, team_id) values ($1, $2, $3)`, [ids.matchA, ids.playerC, ids.teamA]],
      [`update matches set captain_id = $2 where id = $1`, [ids.matchA, ids.playerB]],
      [`insert into match_goals (match_id, team_id, side, scorer_id) values ($1, $3, 'for', $2)`, [ids.matchA, ids.playerB, ids.teamA]],
      [`update team_sheets set available = array[$2::uuid] where match_id = $1`, [ids.matchA, ids.playerB]],
      [`insert into defence_spells (match_id, team_id, player_ids, minutes) values ($1, $3, array[$2::uuid], 10)`, [ids.matchA, ids.playerC, ids.teamA]],
    ];
    for (const [sql, params] of cases) {
      await expect(db.query(sql, params), sql).rejects.toThrow(/foreign key|does not belong/);
    }
  });
});

describe('invites', () => {
  it('only work for the email they were sent to, once', async () => {
    const token = (
      await as(db, u.carol, (tx) =>
        one<{ token: string }>(tx, `insert into invites (club_id, team_id, email, role) values ($1, $2, 'Someone@Example.com', 'parent') returning token`, [
          ids.club1,
          ids.teamA,
        ]),
      )
    ).token;
    await expect(as(db, u.bob, (tx) => tx.query('select * from accept_invite($1)', [token]))).rejects.toThrow(/different email/);

    const someone = { id: await createUser(db, 'someone@example.com'), email: 'someone@example.com' };
    const details = await as(db, someone, (tx) => one<{ team_name: string; role: string }>(tx, 'select * from invite_details($1)', [token]));
    expect(details).toMatchObject({ team_name: 'U13s', role: 'parent' });
    const slugs = await as(db, someone, (tx) => one(tx, 'select * from accept_invite($1)', [token]));
    expect(slugs).toEqual({ club_slug: 'appley-bridge', team_slug: 'u13' });
    await expect(as(db, someone, (tx) => tx.query('select * from accept_invite($1)', [token]))).rejects.toThrow(/already used/);
  });

  it('never downgrades a coach to parent', async () => {
    await invite(u.alice, u.carol, ids.club1, ids.teamA, 'parent');
    const rows = await as(db, u.carol, async (tx) => (await tx.query<{ role: string }>(`select role from my_teams() where team_id = $1`, [ids.teamA])).rows);
    expect(rows).toEqual([{ role: 'coach' }]);
  });

  it('cannot be created by a coach for another team', async () => {
    await expect(
      as(db, u.bob, (tx) =>
        tx.query(`insert into invites (club_id, team_id, email, role) values ($1, $2, 'x@example.com', 'coach')`, [ids.club1, ids.teamA]),
      ),
    ).rejects.toThrow(/row-level security/);
    // Nor smuggled into a different club by mislabelling club_id.
    await expect(
      as(db, u.frank, (tx) =>
        tx.query(`insert into invites (club_id, team_id, email, role) values ($1, $2, 'x@example.com', 'coach')`, [ids.club1, ids.teamC]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('views', () => {
  it('total player seasons, and apply RLS to the viewer', async () => {
    await as(db, u.dave, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `select player_name, appearances, minutes, gk_minutes, outfield_minutes, minutes_by_position, captaincies, potm, saves, goals
         from v_player_season_totals order by player_name`,
      );
      expect(rows).toEqual([
        { player_name: 'A Defender', appearances: 1, minutes: '50', gk_minutes: '0', outfield_minutes: '50', minutes_by_position: { CB: 30, CM: 20 }, captaincies: 1, potm: 0, saves: 0, goals: 2 },
        { player_name: 'A Keeper', appearances: 1, minutes: '60', gk_minutes: '60', outfield_minutes: '0', minutes_by_position: { GK: 60 }, captaincies: 0, potm: 1, saves: 7, goals: 0 },
      ]);
      const summary = await one(tx, `select played, won, drawn, lost, goals_for, goals_against from v_season_summary`);
      expect(summary).toEqual({ played: 1, won: 1, drawn: 0, lost: 0, goals_for: 2, goals_against: 1 });
    });
  });
});

class Rollback extends Error {}
const ignoreRollback = (e: unknown) => {
  if (!(e instanceof Rollback)) throw e;
};
