# Récupération WHOOP automatique côté serveur

Le serveur (Supabase) va chercher tes données WHOOP chaque heure et les garde dans `whoop_cache`.
Chaque appareil connecté à la synchro lit simplement cette table : plus aucun appel à WHOOP depuis le navigateur.

1. **Fonction** : Edge Functions → `whoop` → Code → remplace tout par le contenu de `supabase/functions/whoop/index.ts` → Deploy.
2. **Secret** : Edge Functions → Secrets → ajoute `CRON_SECRET` avec un mot secret de ton choix (long, au hasard).
3. **Table** : SQL Editor → colle `supabase/whoop-cache.sql` → Run.
4. **Planification** : SQL Editor → exécute (en remplaçant `TON-PROJET` et `TON_MOT_SECRET`) :

```sql
select cron.schedule('soma-whoop-horaire', '7 * * * *', $$
  select net.http_post(
    url := 'https://TON-PROJET.supabase.co/functions/v1/whoop',
    headers := '{"Content-Type":"application/json","x-cron-secret":"TON_MOT_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

Le mot secret ne va jamais dans le dépôt : seulement dans les secrets de la fonction et dans ta base.
