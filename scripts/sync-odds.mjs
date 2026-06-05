import { loadLocalEnv, requireEnv } from './lib/env.mjs';
import { findSweepMatch, canonicalTeamName } from './lib/match-map.mjs';
import { upsertRows } from './lib/supabase-rest.mjs';

loadLocalEnv();

const apiKey = requireEnv('ODDS_API_KEY');
const sportKey = process.env.ODDS_API_SPORT_KEY || 'soccer_fifa_world_cup';
const regions = process.env.ODDS_API_REGIONS || 'au,uk,us';
const markets = process.env.ODDS_API_MARKETS || 'h2h';
const bookmakers = process.env.ODDS_API_BOOKMAKERS || '';
const oddsFormat = process.env.ODDS_API_FORMAT || 'decimal';

const params = new URLSearchParams({
  apiKey,
  regions,
  markets,
  oddsFormat,
});

if (bookmakers) {
  params.delete('regions');
  params.set('bookmakers', bookmakers);
}

const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?${params}`;
const response = await fetch(url);

if (!response.ok) {
  const body = await response.text();
  throw new Error(`The Odds API request failed: ${response.status} ${body}`);
}

const events = await response.json();
const rows = [];
const unmatched = [];

for (const event of events) {
  const sweepMatch = findSweepMatch(event.home_team, event.away_team);
  if (!sweepMatch) {
    unmatched.push(`${event.home_team} vs ${event.away_team}`);
    continue;
  }

  const bookmaker = event.bookmakers?.[0];
  const market = bookmaker?.markets?.find((item) => item.key === 'h2h');
  if (!bookmaker || !market) continue;

  const prices = { home: null, draw: null, away: null };
  for (const outcome of market.outcomes || []) {
    const outcomeTeam = canonicalTeamName(outcome.name);
    if (outcomeTeam === canonicalTeamName(sweepMatch.home)) prices.home = outcome.price;
    else if (outcomeTeam === canonicalTeamName(sweepMatch.away)) prices.away = outcome.price;
    else if (outcomeTeam === 'draw') prices.draw = outcome.price;
  }

  rows.push({
    match_id: sweepMatch.id,
    provider: 'the-odds-api',
    provider_event_id: event.id,
    bookmaker: bookmaker.title || bookmaker.key,
    home_price: prices.home,
    draw_price: prices.draw,
    away_price: prices.away,
    last_updated: bookmaker.last_update || null,
    raw: event,
  });
}

await upsertRows('odds_cache', rows);

console.log(`Synced ${rows.length} odds rows from ${sportKey}.`);
if (unmatched.length) {
  console.warn(`Unmatched odds events: ${unmatched.length}`);
  unmatched.slice(0, 12).forEach((match) => console.warn(`- ${match}`));
}
