import { loadLocalEnv, requireEnv } from './lib/env.mjs';
import { findSweepMatch, resultFromScore } from './lib/match-map.mjs';
import { upsertRows } from './lib/supabase-rest.mjs';

loadLocalEnv();

const token = requireEnv('FOOTBALL_DATA_API_KEY');
const matchesUrl = process.env.FOOTBALL_DATA_MATCHES_URL || 'https://api.football-data.org/v4/competitions/WC/matches';

const response = await fetch(matchesUrl, {
  headers: { 'X-Auth-Token': token },
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`football-data.org request failed: ${response.status} ${body}`);
}

const payload = await response.json();
const providerMatches = payload.matches || [];
const metadataRows = [];
const resultRows = [];
const unmatched = [];

for (const item of providerMatches) {
  const homeName = item.homeTeam?.name || item.homeTeam?.shortName;
  const awayName = item.awayTeam?.name || item.awayTeam?.shortName;
  const sweepMatch = findSweepMatch(homeName, awayName);

  if (!sweepMatch) {
    unmatched.push(`${homeName} vs ${awayName}`);
    continue;
  }

  const homeScore = item.score?.fullTime?.home ?? item.score?.regularTime?.home ?? null;
  const awayScore = item.score?.fullTime?.away ?? item.score?.regularTime?.away ?? null;
  const result = ['FINISHED', 'AWARDED'].includes(item.status)
    ? resultFromScore(homeScore, awayScore, homeName, sweepMatch)
    : null;

  metadataRows.push({
    match_id: sweepMatch.id,
    provider: 'football-data.org',
    provider_match_id: String(item.id),
    home: sweepMatch.home,
    away: sweepMatch.away,
    utc_kickoff: item.utcDate || null,
    status: item.status || null,
    home_score: homeScore,
    away_score: awayScore,
    result,
    raw: item,
  });

  if (result) {
    resultRows.push({
      match_id: sweepMatch.id,
      result,
    });
  }
}

await upsertRows('match_metadata', metadataRows);
await upsertRows('results', resultRows);

console.log(`Synced ${metadataRows.length} match metadata rows.`);
console.log(`Synced ${resultRows.length} finished results.`);
if (unmatched.length) {
  console.warn(`Unmatched provider matches: ${unmatched.length}`);
  unmatched.slice(0, 12).forEach((match) => console.warn(`- ${match}`));
}
