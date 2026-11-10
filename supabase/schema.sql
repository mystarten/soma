-- ─────────────────────────────────────────────────────────────────────────
--  Soma — schéma Supabase
--  À coller tel quel dans Supabase → SQL Editor → Run.
--  Idempotent : tu peux le relancer sans rien casser.
--
--  Modèle : une table de lignes génériques (soma_rows). Chaque entité de
--  l'app (jour, séance, exercice, objectif, métrique, modèle, réglages) y
--  est stockée en JSON avec son horodatage. Ce choix rend le schéma
--  insensible aux évolutions de l'app : ajouter un champ côté client ne
--  demande aucune migration côté serveur.
--
--  Sécurité : Row Level Security stricte. Une ligne n'est lisible et
--  modifiable que par son propriétaire (auth.uid() = user_id). Aucune
--  policy ne permet de voir les données d'un autre compte.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Table principale : lignes synchronisées ──────────────────────────────

-- Pour un projet déjà créé avec l'ancienne liste de tables :
alter table if exists public.soma_rows drop constraint if exists soma_rows_table_name_check;

create table if not exists public.soma_rows (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  table_name  text        not null,
  row_id      text        not null,
  data        jsonb       not null default '{}'::jsonb,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint soma_rows_pkey primary key (user_id, table_name, row_id),
  constraint soma_rows_table_name_check check (
    table_name in (
      'checkins', 'workouts', 'exercises', 'goals',
      'metrics', 'templates', 'workoutTypes', 'settings',
      'tasks', 'deadlines'
    )
  ),
  constraint soma_rows_row_id_len check (char_length(row_id) between 1 and 128)
);

comment on table public.soma_rows is
  'Lignes synchronisées de Soma. Une ligne par entité et par utilisateur.';

-- Index : la synchronisation incrémentale lit « tout ce qui a changé depuis X ».
alter table public.soma_rows drop constraint if exists soma_rows_table_name_check;
alter table public.soma_rows add constraint soma_rows_table_name_check check (
  table_name in (
    'checkins', 'workouts', 'exercises', 'goals',
    'metrics', 'templates', 'workoutTypes', 'settings',
    'tasks', 'deadlines'
  )
);

create index if not exists soma_rows_user_updated_idx
  on public.soma_rows (user_id, updated_at desc);

create index if not exists soma_rows_user_table_idx
  on public.soma_rows (user_id, table_name);

-- Horodatage serveur : la dernière écriture gagne, et l'heure fait foi.
create or replace function public.soma_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := greatest(coalesce(new.updated_at, now()), now());
  return new;
end;
$$;

drop trigger if exists soma_rows_touch on public.soma_rows;
create trigger soma_rows_touch
  before insert or update on public.soma_rows
  for each row execute function public.soma_touch_updated_at();

-- ── Table secondaire : profil / état de synchronisation ──────────────────

create table if not exists public.soma_profiles (
  user_id      uuid        not null primary key references auth.users (id) on delete cascade,
  display_name text,
  last_sync_at timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.soma_profiles is
  'Un profil par compte : nom affiché et date de dernière synchronisation.';

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.soma_rows     enable row level security;
alter table public.soma_profiles enable row level security;

-- Personne d'autre que le propriétaire, y compris en lecture.
drop policy if exists "soma_rows_select_own" on public.soma_rows;
create policy "soma_rows_select_own" on public.soma_rows
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "soma_rows_insert_own" on public.soma_rows;
create policy "soma_rows_insert_own" on public.soma_rows
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "soma_rows_update_own" on public.soma_rows;
create policy "soma_rows_update_own" on public.soma_rows
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "soma_rows_delete_own" on public.soma_rows;
create policy "soma_rows_delete_own" on public.soma_rows
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "soma_profiles_select_own" on public.soma_profiles;
create policy "soma_profiles_select_own" on public.soma_profiles
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "soma_profiles_upsert_own" on public.soma_profiles;
create policy "soma_profiles_upsert_own" on public.soma_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "soma_profiles_update_own" on public.soma_profiles;
create policy "soma_profiles_update_own" on public.soma_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Aucun accès pour les visiteurs non connectés.
revoke all on public.soma_rows     from anon;
revoke all on public.soma_profiles from anon;

grant select, insert, update, delete on public.soma_rows     to authenticated;
grant select, insert, update          on public.soma_profiles to authenticated;

-- ── Création automatique du profil à l'inscription ───────────────────────

create or replace function public.soma_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.soma_profiles (user_id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists soma_on_auth_user_created on auth.users;
create trigger soma_on_auth_user_created
  after insert on auth.users
  for each row execute function public.soma_handle_new_user();
