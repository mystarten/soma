# Soma

Suivi sportif, santé et récupération. Vue d'ensemble, pas alarme : l'app compare
ce que tu fais vraiment à ce que tu voulais faire, et te montre l'état de ton
corps en 3D.

**Aucune IA, aucune API externe.** Tout est calculé sur ton appareil à partir de
règles fixes et de statistiques locales.

- Stockage local IndexedDB (Dexie) — fonctionne hors ligne.
- Synchronisation facultative entre PC et téléphone via Supabase (lien magique,
  Row Level Security stricte).
- Installable sur iPhone et Android (PWA).

---

## 1. Lancer en local

```bash
npm install
```

```bash
npm run dev
```

L'app s'ouvre sur `http://localhost:5173/soma/`. Sans configuration Supabase
elle fonctionne déjà à 100 %, avec un bandeau discret « Sync désactivée ».

```bash
npm test
```

---

## 2. Créer le projet Supabase (facultatif)

La sync n'est utile que si tu veux retrouver tes données sur plusieurs
appareils. Tout le reste marche sans.

1. Va sur [supabase.com](https://supabase.com), crée un projet (offre gratuite).
2. Ouvre **SQL Editor → New query**, colle le contenu de
   [`supabase/schema.sql`](supabase/schema.sql), puis **Run**.
3. Ouvre **Authentication → Sign In / Providers** et vérifie que **Email** est
   activé avec les liens magiques (*Magic Link*).
4. Dans **Authentication → URL Configuration**, ajoute l'URL de ton site dans
   *Redirect URLs* : `https://<ton-compte>.github.io/soma/`
   (et `http://localhost:5173/soma/` pour le développement).
5. Récupère dans **Project Settings → API** :
   - *Project URL* → `VITE_SUPABASE_URL`
   - *anon public* → `VITE_SUPABASE_ANON_KEY`

> La clé `anon` est faite pour vivre dans le navigateur : elle ne donne accès
> qu'aux lignes autorisées par la RLS. Ne mets **jamais** la clé `service_role`
> dans ce projet.

### En local

```bash
cp .env.example .env
```

puis renseigne les deux valeurs dans `.env`.

---

## 3. Mettre en ligne sur GitHub Pages

### Créer le dépôt

Avec la CLI GitHub, depuis le dossier du projet :

```bash
gh auth login
```

```bash
gh repo create soma --public --source=. --remote=origin --push
```

Si tu préfères sans `gh` :

```bash
git remote add origin https://github.com/<ton-compte>/soma.git
```

```bash
git push -u origin main
```

### Activer Pages

Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub
Actions**. C'est tout : le workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) construit et
publie à chaque push sur `main`.

Le chemin de base est calculé automatiquement à partir du nom du dépôt, donc
l'URL finale est :

```
https://<ton-compte>.github.io/soma/
```

### Secrets (seulement si tu utilises Supabase)

**Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
| --- | --- |
| `VITE_SUPABASE_URL` | l'URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | la clé publique `anon` |

Sans ces secrets, le site se déploie quand même, en mode 100 % local.

---

## 4. Installer l'app sur ton téléphone

**iPhone (Safari uniquement)** : ouvre l'URL → bouton *Partager* →
*Sur l'écran d'accueil* → *Ajouter*.

**Android (Chrome)** : ouvre l'URL → menu ⋮ → *Installer l'application* (ou
*Ajouter à l'écran d'accueil*).

L'app s'ouvre alors en plein écran, en thème sombre, et fonctionne hors ligne.

---

## 5. Importer ton export WHOOP

1. Dans l'app WHOOP : **Plus → Paramètres de l'app → Données → Créer un export**.
2. Tu reçois un e-mail avec une archive `.zip`.
3. Dans Soma : écran **Import WHOOP**, dépose le zip (ou les CSV qu'il contient).
4. Un aperçu indique le nombre de jours, de nuits et de séances détectés. Valide.

Tout est lu dans le navigateur. Rien n'est envoyé ailleurs que dans ta propre
base.

Fichiers reconnus : `physiological_cycles.csv`, `sleeps.csv`, `workouts.csv`,
`journal_entries.csv`. Les colonnes absentes sont ignorées, les ré-imports ne
créent pas de doublons, et tes saisies manuelles ne sont jamais écrasées.

> Le dépôt est public : `whoop-export/`, `data/` et tous les `*.csv` sont déjà
> dans `.gitignore`. Tes données ne partent jamais sur GitHub.

---

## 6. Réglages à faire une fois

Écran **Réglages** :

- **Profil** : taille et poids (indispensable pour les exercices lestés).
- **Références par exercice** : tes maxima réels. Ils calibrent tout le moteur
  de fatigue. Valeurs de départ pré-remplies, modifiables.
- **Zones de FC**, début de semaine, objectif de sommeil, couleur d'accent.
- **Moteur de fatigue** : toutes les constantes, avec un bouton « valeurs par
  défaut ».
- **Données de démo** : générables et supprimables en un clic, pour voir l'app
  remplie avant d'avoir du vrai historique.

---

## Le cerveau : tâches et connaissances

L'accueil **Vie** met le bonhomme au centre, avec la to-do juste dessous.

- **Entrer dans le cerveau** : molette vers l'avant sur la tête (ou écarter deux doigts sur
  téléphone, ou bouton « Réseau »). Le zoom est continu, sans changement d'écran : la caméra
  descend dans la tête, le corps s'efface et les neurones apparaissent. Tes tâches, échéances et
  fiches forment un réseau 3D. Clic sur un neurone = ouvrir la fiche ou la tâche. Pour revenir :
  molette arrière, Échap ou « Revenir au corps » (même trajectoire en sens inverse).
- **Savoir** : tes fiches, classées par axe puis par type, avec recherche, liens `[[Titre]]`
  façon Obsidian, `#tags` et une section « À trancher » pour les infos qui se contredisent.
- **Importer ce que Claude sait de toi** : Savoir → Importer, puis colle le texte. Format :
  `Titre [type, axe nom] — description` suivi de lignes `* (stated) fait` ou `* (verify) doute`.
  Le bouton « Comment obtenir ce texte » donne le message à envoyer à Claude. Réimporter met
  à jour sans doublon et ne touche jamais aux fiches que tu as modifiées.
- **Où sont les données** : dans le navigateur (IndexedDB), sur chaque appareil. Rien de
  personnel n'est dans le dépôt : ne commite jamais d'export dans `data/` ou `whoop-export/`.

## Le moteur de fatigue en bref

Fonction pure et testée, dans `src/engine/fatigue.ts`. Pour chaque zone :

1. **Effort d'une série** = `reps / reps max estimées à cette charge`
   (1RM via Epley, poids du corps × facteur + lest). Le repos entre séries module
   l'intensité (90 s = neutre, 30 s ×1,15, 3 min ×0,9). Plafonné à 1,2 ;
   × 1,25 si série menée à l'échec. Pour les statiques :
   `tenue / record de tenue`. Pour la course et le cardio :
   `durée × intensité`, avec un bonus excentrique sur le dénivelé négatif.
2. **Répartition musculaire** : coefficients par exercice
   (`src/engine/muscleMap.ts`), réglables par curseur dans Réglages.
3. **Fatigue initiale** : `F0 = 100 × (1 − exp(−(V / k + w · P²)))`
   où `V` est le volume relatif et `P` le pic d'intensité de la séance sur la
   zone. Majoration de 15 % si la charge dépasse 150 % de la moyenne 4 semaines.
4. **Récupération** : décroissance horaire `exp(−m / τ)`.
   `τ` ≈ 14 h (petits muscles), 16 h (moyens), 18 h (gros) : avec de bonnes nuits,
   une grosse séance est revenue à la normale après ~48 h.
   `m` monte jusqu'à 1,6 pendant le sommeil selon la qualité de la nuit, varie
   de 0,8 à 1,2 en éveil selon la récupération du jour, et vaut 1 sans données.
   L'heure de la séance compte donc vraiment.
5. **Couleur** : vert-cyan → jaune → ambre → orange → rouge, interpolation
   continue, pulsation au-delà de 75. Zone sans historique : gris-bleu neutre.

Toutes les constantes vivent dans `src/engine/fatigueConfig.ts` et sont
modifiables dans l'app.

## Suivi de fond

Aucune alerte sur un jour isolé. Une observation n'apparaît que si la moyenne
mobile 7 jours s'écarte de plus d'un écart type de la base personnelle
28 jours, **pendant au moins 5 jours d'affilée**. Trois observations affichées
au maximum, deux niveaux (`info`, `à noter`) et un niveau `à surveiller` très
rare (FC de repos +5 bpm **et** HRV −20 % pendant 7 jours).

## Structure

```
src/
  engine/      moteur de calcul, sans React (fatigue, charge, sommeil,
               cardio, objectifs, observations, parseur WHOOP)
  db/          Dexie, migrations versionnées, amorçage, données de démo
  sync/        client Supabase et file de synchronisation
  components/  UI, graphiques, corps 3D et repli 2D
  screens/     les dix écrans
supabase/schema.sql
```

## Licence

Usage personnel.


### Neurones principaux et import en plan

- Dans le cerveau, les tâches sont regroupées sous un neurone **Tâches** (et les échéances sous **Échéances**) : un clic sur ce neurone les déplie ou les replie.
- **Savoir → Importer** accepte maintenant aussi un texte en *plan* (titres et puces imbriquées) : chaque rubrique et sous-rubrique devient un neurone, et la partie « À vérifier » est rangée à part. Les imports se fusionnent par titre, sans rien écraser.

## Mon programme, ma revue, mon tableau de bord

- **Programme** (Séances → onglet *Programme*) : importe ton fichier Word (`.docx`, un tableau par séance avec les semaines en lignes). Le fichier est lu dans ton navigateur et rien n'est envoyé nulle part ; il n'est **jamais** dans ce dépôt. Ensuite tu touches une case *séance × semaine* (plusieurs séances possibles le même jour, dans n'importe quel ordre) : séries, reps, charges et repos se préremplissent. Le type de séance reste modifiable dans l'éditeur.
- **Revue** : chaque semaine, quelques chiffres, ce qui a changé, une question, trois lignes à écrire. Règles simples, sans IA externe.
- **Tableau de bord** : récupération, charge, programme, tendances, échéances et objectifs sur un écran.
- **Cerveau** : en zoomant dessus, la carte s'agrandit progressivement jusqu'au plein écran (Échap ou « Revenir au corps » pour sortir).
- **Corps** : la molette (ou le pincement) zoome sur la région visée ; de près apparaissent les chefs musculaires, les os des articulations, et près de la poitrine le cœur anatomique et la cage thoracique. Les boutons « Cœur, Épaule, Genou… » y mènent directement. Rendu schématique (hologramme), pas un atlas médical.

## Synchroniser PC et téléphone

Réglages → *Synchronisation entre appareils* t'explique tout pas à pas (compte Supabase gratuit, un texte à coller, deux valeurs à copier). Une fois active sur le PC, « Copier le lien pour mon téléphone » configure le téléphone en un geste. Tout ce qui existe déjà sur un appareil (programme, séances, tâches, connaissances) est envoyé à la première connexion. Tu peux aussi fournir `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` au build (voir plus haut). Seule la clé publique `anon` est utilisée, jamais la clé `service_role`.
