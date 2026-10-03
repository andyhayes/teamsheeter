# Teamsheeter

Builds a team sheet and full substitution schedule for a fixture, spreading pitch time as evenly as possible across the squad. Replaces the manual templates in `TeamSheetTemplates.xlsx`.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # scheduler tests
npm run build    # static site in dist/
```

## Using it

1. **Squad** tab: add players and tick the positions each is happy in (include `GK` for keepers).
2. **Match day** tab: set the fixture, formation, substitution periods and keeper(s), and tick who's available.
   Each period structure shows the fairest minutes range possible with the selected squad, so you can pick the best one.
3. The schedule is generated automatically. Click two cells in the same column to swap players (pitch ↔ pitch or pitch ↔ bench).
   Swapped cells are locked; **Regenerate** keeps locks and rebalances everyone else. **Shuffle** tries a different, equally fair arrangement.
4. **Print** (one A4 portrait page, with a blank tally chart for GK saves, shots, shots on target, assists and goals), **Copy image** (the grid as a picture, ready to paste into a message) or **Copy for Excel** (pastes in the same layout as the spreadsheet).

Data is saved in the browser's local storage. **Export** (top right) saves everything — squad, fixture, team sheet and locks — to a JSON file; **Import** restores it, e.g. on another computer.

## How the schedule is built

`src/lib/scheduler.ts`, in two stages:

1. **Who's on each period**: simulated annealing over on/off choices, minimising the sum of squared minutes (even playing time)
   plus small penalties for substitutions (cheaper at half-time), broken-up spells and long bench stints. Keepers and locked cells are fixed.
2. **Where they play**: an exact per-period assignment that favours preferred positions, then the same line
   (defence/midfield/attack), and keeps players in place between periods.

It's seeded, so results are repeatable; Shuffle changes the seed.

## Deploying

`netlify.toml` configures Netlify: connect the repo (or run `netlify deploy`) and it builds with `npm run build` and publishes `dist/`. It's a static site with no server, and each browser keeps its own data, so use Export/Import to move data between devices.
