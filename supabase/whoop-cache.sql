-- Dernière récupération WHOOP gardée côté serveur (remplie chaque jour par la fonction `whoop`).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
create table if not exists public.whoop_cache (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  raw        jsonb       not null,
  fetched_at timestamptz not null default now()
);

alter table public.whoop_cache enable row level security;

-- Chacun ne peut lire que sa propre ligne ; seule la fonction (clé service) écrit.
drop policy if exists "whoop_cache_select_own" on public.whoop_cache;
create policy "whoop_cache_select_own" on public.whoop_cache
  for select using (auth.uid() = user_id);

-- Pour la tâche planifiée (étape suivante du guide) :
create extension if not exists pg_cron;
create extension if not exists pg_net;
