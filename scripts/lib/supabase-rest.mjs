import { requireEnv } from './env.mjs';

export function getSupabaseConfig() {
  return {
    url: requireEnv('VITE_SUPABASE_URL').replace(/\/$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('VITE_SUPABASE_ANON_KEY'),
  };
}

export async function upsertRows(table, rows, { onConflict = 'match_id' } = {}) {
  if (!rows.length) return { count: 0 };

  const { url, key } = getSupabaseConfig();
  const endpoint = `${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase upsert failed for ${table}: ${response.status} ${body}`);
  }

  return { count: rows.length };
}
