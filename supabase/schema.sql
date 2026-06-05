-- Proper Pies WC 2026 Sweep
-- Run this in the Supabase SQL editor for a new project.

create table if not exists public.predictions (
  user_id text not null,
  match_id text not null,
  choice text not null check (choice in ('home', 'draw', 'away')),
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

create table if not exists public.results (
  match_id text primary key,
  result text not null check (result in ('home', 'draw', 'away')),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_settings (
  user_id text primary key,
  password text,
  locked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists public.match_metadata (
  match_id text primary key,
  provider text,
  provider_match_id text,
  home text not null,
  away text not null,
  utc_kickoff timestamptz,
  status text,
  home_score integer,
  away_score integer,
  result text check (result in ('home', 'draw', 'away')),
  raw jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.odds_cache (
  match_id text primary key,
  provider text,
  provider_event_id text,
  bookmaker text,
  home_price numeric,
  draw_price numeric,
  away_price numeric,
  last_updated timestamptz,
  raw jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists predictions_updated_at on public.predictions;
create trigger predictions_updated_at
before update on public.predictions
for each row execute function public.set_updated_at();

drop trigger if exists results_updated_at on public.results;
create trigger results_updated_at
before update on public.results
for each row execute function public.set_updated_at();

drop trigger if exists player_settings_updated_at on public.player_settings;
create trigger player_settings_updated_at
before update on public.player_settings
for each row execute function public.set_updated_at();

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists match_metadata_updated_at on public.match_metadata;
create trigger match_metadata_updated_at
before update on public.match_metadata
for each row execute function public.set_updated_at();

drop trigger if exists odds_cache_updated_at on public.odds_cache;
create trigger odds_cache_updated_at
before update on public.odds_cache
for each row execute function public.set_updated_at();

alter table public.predictions enable row level security;
alter table public.results enable row level security;
alter table public.player_settings enable row level security;
alter table public.app_settings enable row level security;
alter table public.match_metadata enable row level security;
alter table public.odds_cache enable row level security;

drop policy if exists "Public read predictions" on public.predictions;
create policy "Public read predictions"
on public.predictions for select
to anon
using (true);

drop policy if exists "Public write predictions" on public.predictions;
create policy "Public write predictions"
on public.predictions for all
to anon
using (true)
with check (true);

drop policy if exists "Public read results" on public.results;
create policy "Public read results"
on public.results for select
to anon
using (true);

drop policy if exists "Public write results" on public.results;
create policy "Public write results"
on public.results for all
to anon
using (true)
with check (true);

drop policy if exists "Public read player settings" on public.player_settings;
create policy "Public read player settings"
on public.player_settings for select
to anon
using (true);

drop policy if exists "Public write player settings" on public.player_settings;
create policy "Public write player settings"
on public.player_settings for all
to anon
using (true)
with check (true);

drop policy if exists "Public read app settings" on public.app_settings;
create policy "Public read app settings"
on public.app_settings for select
to anon
using (true);

drop policy if exists "Public write app settings" on public.app_settings;
create policy "Public write app settings"
on public.app_settings for all
to anon
using (true)
with check (true);

drop policy if exists "Public read match metadata" on public.match_metadata;
create policy "Public read match metadata"
on public.match_metadata for select
to anon
using (true);

drop policy if exists "Public write match metadata" on public.match_metadata;
create policy "Public write match metadata"
on public.match_metadata for all
to anon
using (true)
with check (true);

drop policy if exists "Public read odds cache" on public.odds_cache;
create policy "Public read odds cache"
on public.odds_cache for select
to anon
using (true);

drop policy if exists "Public write odds cache" on public.odds_cache;
create policy "Public write odds cache"
on public.odds_cache for all
to anon
using (true)
with check (true);

-- Optional: in Supabase, enable Realtime for these tables:
-- public.predictions
-- public.results
-- public.player_settings
-- public.match_metadata
-- public.odds_cache
