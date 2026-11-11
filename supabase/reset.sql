-- ⚠️  RÉINITIALISATION COMPLÈTE de Soma sur Supabase.
-- Supprime TOUTES les données synchronisées (séances, check-ins, tâches, connaissances,
-- programme, jetons WHOOP…) et les objets créés par Soma. Ne touche PAS aux comptes
-- (auth.users) ni aux autres tables de ton projet.
-- Ton téléphone et ton PC gardent leurs données locales : elles seront renvoyées à la
-- prochaine synchronisation si tu les as sur un appareil.
-- Exécute-le UNE fois dans SQL Editor, puis exécute supabase/schema.sql et supabase/whoop.sql.

drop trigger if exists soma_on_auth_user_created on auth.users;
drop trigger if exists soma_rows_touch on public.soma_rows;

drop function if exists public.soma_handle_new_user();
drop function if exists public.soma_touch_updated_at();

drop table if exists public.whoop_tokens;
drop table if exists public.soma_profiles;
drop table if exists public.soma_rows;
