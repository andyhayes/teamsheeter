# Teamsheeter

Builds a team sheet and full substitution schedule for a fixture, spreading pitch time as evenly as possible across the squad. Replaces the manual templates in `TeamSheetTemplates.xlsx`.

It's a web app for running a team's season: fixtures, team sheets saved per fixture, results, match reports,
per-player stats, defensive partnerships and club records. Clubs have any number of teams. Coaches edit their
own teams and parents get read-only access. Data lives in Supabase (Postgres with row-level security).

```sh
npm install
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev                  # http://localhost:5173
npm test                     # scheduler, stats, records, access rules and importer tests
npm run typecheck
npm run build                # static site in dist/
```

Without a `.env.local`, the app runs as the original browser-only team sheet tool (also at `/local`).

## Setting up Supabase and Netlify

1. Create a Supabase project, then run every file in `supabase/migrations/` in order (SQL editor, or
   `npx supabase link` + `npx supabase db push`).
2. Authentication → URL Configuration: set the Site URL to the Netlify address and add redirect URLs for
   `https://<site>.netlify.app/**`, `https://*--<site>.netlify.app/**` (deploy previews) and `http://localhost:5173/**`.
3. Authentication → Email templates → Magic Link: include `{{ .Token }}` so people can type the code if the
   link opens in another browser. Set up custom SMTP before inviting parents (the built-in sender is rate limited).
4. In Netlify, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and redeploy (they're baked in at build time).

## Who can see what

Access is per team: a coach edits their teams and a parent views theirs. One login can coach at one club and be a parent
at another. Club admins create teams and manage members and invites, but see no team data unless they also join a team.
`supabase/tests/rls.test.ts` checks this against the real migrations (in PGlite).

## Importing a season workbook

Create the club and team in the app first, then:

```sh
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run import-xlsx -- \
  --club appley-bridge --team u13 --season 2026/27 --age U13 \
  --alias "George A=George" "Appley Bridge U13 season 26_27.xlsx"
```

It reads Match Reports, Data Entry, Defence Data Entry and Previous Seasons Data (skipping the current season's rows,
which that sheet looks up from this one). Re-running it updates rather than duplicates. Keep the service-role key off
Netlify and out of `VITE_` variables. Workbooks are git-ignored because they hold children's names.

## Making a team sheet

1. **Squad**: add players and tick the positions each is happy in (include `GK` for keepers).
2. **Fixtures**: add the fixture, then **Create team sheet**. It starts with the season's squad and their preferred
   positions, plus the formation and periods from your last sheet (or **Copy previous** to start from the last grid).
3. Pick formation, substitution periods, keeper(s) and who's available. Each period structure shows the fairest
   minutes range possible with the selected squad. Click two cells in the same column to swap players (swapped cells
   lock); **Regenerate** keeps locks and rebalances everyone else, and **Shuffle** tries a different, equally fair arrangement.
4. Every change saves to the fixture (kept on the device if the signal drops, then synced). **Print**, **Copy image**
   and **Copy for Excel** work as before.
5. During or after the match, on the team sheet (outside **Edit**): tap − / + for each player's saves, shots, assists and
   goals, and for goals for/against in each period, or log a goal with its minute, scorer and assist. Then fill in
   **Result & report**. Minutes by position, on-pitch goals and back lines follow the team sheet and goal log
   automatically; the **Stats** tab summarises it all.

## How the schedule is built

`src/lib/scheduler.ts`, in two stages:

1. **Who's on each period**: simulated annealing over on/off choices, minimising the sum of squared minutes (even playing time)
   plus small penalties for substitutions (cheaper at half-time), broken-up spells and long bench spells (anything over 10 minutes is penalised increasingly, so nobody sits out for half the match). Keepers and locked cells are fixed.
2. **Where they play**: an exact per-period assignment that favours preferred positions, then the same line
   (defence/midfield/attack), and keeps players in place between periods.

It's seeded, so results are repeatable; Shuffle changes the seed.

## Deploying

`netlify.toml` builds with `npm run build`, publishes `dist/`, and serves `index.html` for every route. Set the two
`VITE_SUPABASE_*` variables in Netlify (see above).
