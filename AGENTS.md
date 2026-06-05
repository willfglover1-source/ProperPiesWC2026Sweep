# Agent Notes

## Project Shape

This is a vanilla browser app served by Vite. Keep the current structure unless a broader framework migration is explicitly requested:

- `index.html`: static shell and modal/section markup.
- `src/styles.css`: custom CSS, fonts, and animations.
- `src/main.js`: application state, rendering, persistence, and Supabase realtime behavior.
- `src/data/tournament.js`: players, group/team data, and odds.
- `src/data/matches.js`: generated group-stage match list.
- `src/services/supabaseClient.js`: optional Supabase browser client setup.
- `scripts/sync-football-data.mjs`: pulls fixtures, statuses, scores, and finished results into Supabase.
- `scripts/sync-odds.mjs`: pulls head-to-head match odds into Supabase.
- `supabase/schema.sql`: table contracts, triggers, and development policies.
- `public/assets/`: static media served directly by Vite.
- `legacy/`: historical snapshots only.

## Local Commands

- One-command setup: `npm run setup`
- Install: `npm install`
- Dev server: `npm run dev`
- Validate: `npm run check`
- Build: `npm run build`
- Preview: `npm run preview`
- Sync fixtures/results: `npm run sync:fixtures`
- Sync odds: `npm run sync:odds`
- Sync all external tournament data: `npm run sync:data`
- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm run check`, and `npm run build`.
- Scheduled data sync: `.github/workflows/sync-data.yml`

## Development Guidelines

- Preserve the existing no-framework approach for small changes.
- Keep tournament data in `src/data/tournament.js`.
- Keep generated match logic in `src/data/matches.js`.
- Keep deployment/client configuration out of `src/main.js`.
- The browser relies on global functions because the markup uses inline event handlers.
- Do not commit real secrets. Supabase config belongs in `.env.local` or deployment environment variables.
- Keep `.env.example` updated when config changes.
- Update `supabase/schema.sql` when table contracts change.
- Update README data-sync instructions when adding or changing external providers.
- Treat `legacy/index1.html` as read-only reference unless the user asks to compare or restore it.

## Known Cautions

- Team/group data and odds are hard-coded and may need verification before live use.
- External fixture/odds matching is team-name based. Check sync warnings and provider sport keys before trusting live data.
- Player passwords are not a secure authentication system; they are lightweight client-side sweep protection and currently plain text.
- The Supabase schema intentionally uses permissive anon policies for a private-link browser app.
- CDN dependencies require network access in the browser.
