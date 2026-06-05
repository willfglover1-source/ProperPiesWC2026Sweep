import { readFileSync, existsSync } from 'node:fs';

const requiredFiles = [
  'index.html',
  'src/main.js',
  'src/styles.css',
  'src/data/tournament.js',
  'src/data/matches.js',
  'src/services/supabaseClient.js',
  'public/assets/dunky-image.jpg',
  'public/assets/dunky-audio.mp3',
  'public/assets/dunky-video.mp4',
  '.env.example',
  'scripts/sync-football-data.mjs',
  'scripts/sync-odds.mjs',
  'scripts/lib/env.mjs',
  'scripts/lib/match-map.mjs',
  'scripts/lib/supabase-rest.mjs',
  'supabase/schema.sql',
  'README.md',
  'AGENTS.md',
];

const missing = requiredFiles.filter((file) => !existsSync(file));

if (missing.length > 0) {
  console.error(`Missing required files:\n${missing.map((file) => `- ${file}`).join('\n')}`);
  process.exit(1);
}

const mainJs = readFileSync('src/main.js', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');

const forbiddenPatterns = [
  /https:\/\/[a-z0-9-]+\.supabase\.co/i,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
];

const leakedConfig = forbiddenPatterns.some((pattern) => pattern.test(mainJs));

if (leakedConfig) {
  console.error('src/main.js appears to contain hard-coded Supabase project config. Use Vite env vars instead.');
  process.exit(1);
}

for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'FOOTBALL_DATA_API_KEY', 'ODDS_API_KEY']) {
  if (!envExample.includes(key)) {
    console.error(`.env.example is missing ${key}.`);
    process.exit(1);
  }
}

console.log('Project validation passed.');
