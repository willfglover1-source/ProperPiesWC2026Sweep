# Proper Pies WC 2026 Sweep

A small browser app for running a 9-player World Cup 2026 group-stage prediction sweep.

Players can select their profile, enter predictions for group-stage matches, lock picks, and view a live leaderboard once match results are entered. Admin controls allow results to be set and scores recalculated.

## What Is In Here?

- `index.html` contains the app shell and static markup.
- `src/styles.css` contains the custom CSS and animations.
- `src/main.js` contains the app data, rendering logic, Supabase sync, player password flow, admin tools, and leaderboard scoring.
- `legacy/index1.html` is an older single-file snapshot kept for reference.

The app currently uses CDN-loaded Tailwind CSS, Font Awesome, and Supabase. There is no framework yet; Vite is used as the local dev/build tool.

## Getting Started

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for static hosting:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Data And Sync

The app connects to Supabase from the browser using the public anon key in `src/main.js`. Expected tables are:

- `predictions`
- `results`
- `player_settings`
- `app_settings`

If Supabase is unavailable, parts of the app fall back to `localStorage`.

## Notes

The 2026 match schedule and some group/team data are hard-coded placeholders and should be checked before using this for the real tournament.
