# Proper Pies WC 2026 Sweep

A small browser app for running a 9-player World Cup 2026 group-stage prediction sweep.

Players can select their profile, enter predictions for group-stage matches, lock picks, and view a live leaderboard once match results are entered. Admin controls allow results to be set and scores recalculated.

## What Is In Here?

- `index.html` contains the app shell and static markup.
- `src/styles.css` contains the custom CSS and animations.
- `src/main.js` contains rendering logic, state orchestration, player password flow, admin tools, and leaderboard scoring.
- `src/data/tournament.js` contains players, groups, teams, and odds.
- `src/data/matches.js` generates the group-stage match list.
- `src/services/supabaseClient.js` creates the optional Supabase browser client from environment variables.
- `scripts/sync-football-data.mjs` syncs fixtures, statuses, scores, and finished results.
- `scripts/sync-odds.mjs` syncs head-to-head betting odds.
- `public/assets/` contains static media used by the app.
- `legacy/index1.html` is an older single-file snapshot kept for reference.

The app currently uses CDN-loaded Tailwind CSS, Font Awesome, and Supabase. There is no framework yet; Vite is used as the local dev/build tool.

## Getting Started

One-command local setup:

```bash
npm run setup
```

Or do it manually:

```bash
npm install
cp .env.example .env.local
```

You can leave `.env.local` blank for local-only testing. Add Supabase values when you want everyone to share the same live sweep state.

Run locally:

```bash
npm run dev
```

Check the project:

```bash
npm run check
```

CI runs the same validation and build steps on GitHub pushes and pull requests.

Build for static hosting:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Data And Sync

The app reads Supabase config from Vite environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If either value is missing, the app runs in local-only mode using browser `localStorage`.

For a shared live sweep, create a Supabase project and run:

```sql
-- supabase/schema.sql
```

The schema creates these tables:

- `predictions`
- `results`
- `player_settings`
- `app_settings`
- `match_metadata`
- `odds_cache`

After running the schema, enable Realtime for:

- `public.predictions`
- `public.results`
- `public.player_settings`
- `public.match_metadata`
- `public.odds_cache`

The supplied row-level security policies allow public anon reads and writes because this is currently a private-link browser app. Do not use this setup for sensitive data or a public competition with strangers.

## Automated Fixtures, Scores, And Odds

The app can run manually entered results, but the project is set up for automated data sync through Supabase.

Local sync commands:

```bash
npm run sync:fixtures
npm run sync:odds
npm run sync:data
```

Required local/server secrets:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
FOOTBALL_DATA_API_KEY=...
ODDS_API_KEY=...
```

Optional config:

```bash
FOOTBALL_DATA_MATCHES_URL=https://api.football-data.org/v4/competitions/WC/matches
ODDS_API_SPORT_KEY=soccer_fifa_world_cup
ODDS_API_REGIONS=au,uk,us
ODDS_API_MARKETS=h2h
ODDS_API_FORMAT=decimal
ODDS_API_BOOKMAKERS=pinnacle,sportsbet
```

`.github/workflows/sync-data.yml` runs the same sync on a schedule and can also be triggered manually. Add the values above as GitHub repository secrets or variables before enabling it.

## Deployment

This is a static Vite app, so it can be hosted on Vercel, Netlify, Cloudflare Pages, or any static host.

Set these environment variables in the host if using Supabase:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Then build with:

```bash
npm run build
```

The output is `dist/`.

## Security Notes

The player password system is lightweight convenience protection. Passwords are stored in the browser/Supabase as plain text at the moment, so treat them as sweep nicknames/PINs, not real account passwords.

For a more serious version, the next step is Supabase Auth or a proper server-side admin flow.

## Notes

The 2026 match schedule and some group/team data are hard-coded placeholders and should be checked before using this for the real tournament. API matching is team-name based, so verify unmatched sync warnings before trusting automated scoring.
