import { GROUPS } from '../../src/data/tournament.js';
import { generateMatches } from '../../src/data/matches.js';

const TEAM_ALIASES = new Map([
  ['usa', 'united states'],
  ['united states of america', 'united states'],
  ['usmnt', 'united states'],
  ['south korea', 'korea republic'],
  ['korea republic', 'korea republic'],
  ['ivory coast', 'cote divoire'],
  ['cote d ivoire', 'cote divoire'],
  ['cote divoire', 'cote divoire'],
  ['côte divoire', 'cote divoire'],
  ['côte d’ivoire', 'cote divoire'],
  ['côte d\'ivoire', 'cote divoire'],
  ['turkiye', 'turkiye'],
  ['turkey', 'turkiye'],
  ['curacao', 'curacao'],
  ['curaçao', 'curacao'],
  ['czech republic', 'czechia'],
]);

export const sweepMatches = generateMatches(GROUPS);

export function normalizeTeamName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function canonicalTeamName(name) {
  const normalized = normalizeTeamName(name);
  return TEAM_ALIASES.get(normalized) || normalized;
}

export function findSweepMatch(home, away) {
  const homeKey = canonicalTeamName(home);
  const awayKey = canonicalTeamName(away);

  return sweepMatches.find((match) => {
    const matchHome = canonicalTeamName(match.home);
    const matchAway = canonicalTeamName(match.away);

    return (
      (matchHome === homeKey && matchAway === awayKey) ||
      (matchHome === awayKey && matchAway === homeKey)
    );
  });
}

export function resultFromScore(homeScore, awayScore, providerHome, sweepMatch) {
  if (homeScore === null || homeScore === undefined) return null;
  if (awayScore === null || awayScore === undefined) return null;

  if (homeScore === awayScore) return 'draw';

  const providerHomeIsSweepHome = canonicalTeamName(providerHome) === canonicalTeamName(sweepMatch.home);
  const providerHomeWon = Number(homeScore) > Number(awayScore);

  if (providerHomeIsSweepHome) return providerHomeWon ? 'home' : 'away';
  return providerHomeWon ? 'away' : 'home';
}
