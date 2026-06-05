# Agent Notes

## Project Shape

This is a vanilla browser app served by Vite. Keep the current structure unless a broader framework migration is explicitly requested:

- `index.html`: static shell and modal/section markup.
- `src/styles.css`: custom CSS, fonts, and animations.
- `src/main.js`: all application state, rendering, persistence, and Supabase realtime behavior.
- `legacy/`: historical snapshots only.

## Local Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Development Guidelines

- Preserve the existing no-framework approach for small changes.
- Keep user-facing sweep logic in `src/main.js` unless a module split is part of the task.
- The browser relies on global functions because the markup uses inline event handlers.
- Do not commit real secrets. The existing Supabase anon key is browser-public, but any service-role key or private config belongs in environment variables.
- Treat `legacy/index1.html` as read-only reference unless the user asks to compare or restore it.

## Known Cautions

- Team/group data and odds are hard-coded and may need verification before live use.
- Player passwords are not a secure authentication system; they are lightweight client-side sweep protection.
- CDN dependencies require network access in the browser.
