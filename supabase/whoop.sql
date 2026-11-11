-- Jetons WHOOP : lisibles uniquement par la fonction `whoop` (clé service), jamais par le navigateur.
create table if not exists public.whoop_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);

-- RLS activée et AUCUNE politique : personne n'y accède côté client.
alter table public.whoop_tokens enable row level security;
