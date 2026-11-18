# Setlist : conception technique

La référence du code est [`src/back/CLAUDE.md`](../../src/back/CLAUDE.md) § Module Runs et [`src/front/CLAUDE.md`](../../src/front/CLAUDE.md) § Domaine runs ; ce document donne le principe et les décisions qui ne se lisent pas dans le code. Règles du mode : [`regles.md`](regles.md) ; écrans : [`ecrans.md`](ecrans.md).

## Principe

- **Module `Runs`** (schéma `runs`) dans le monolithe modulaire, à côté de `Daily`. Il n'utilise de Players, Catalogue et Gameplay que leurs `Contracts` ; `Daily` et `Runs` ne se voient pas (tests d'architecture). Le noyau ne connaît aucun mode : Players apprend l'effacement par `IPlayerDataContributor`, Catalogue l'usage d'un morceau par `ITrackUsage`, Social la performance d'un joueur par `IMemberPerformanceSource`, que Runs implémente.
- **La mécanique d'un morceau** (verrou du morceau en cours, plancher d'écoute, correction artiste et titre) vient de `Gameplay` (`TrackRound`), partagée avec le Daily. Runs lui ajoute l'échelle d'écoute, les vies et le chrono.
- **Le serveur décide de tout** : points, vies, palier, neutralisation, fin, record. Le front affiche. Rien qui identifie un morceau avant la réponse (piège 31) : l'extrait n'arrive que morceau par morceau.

## Les décisions qui comptent

- **Playlist sans fin, tirée à la volée.** Une playlist n'a pas de nombre de manches fixé : la manche 1 est tirée à la création, chacune des suivantes par le **premier joueur qui y arrive**, sous un verrou consultatif par défi (`IRunsStore.LockChallengeAsync`), puis figée pour tous. Le tirage coupe le catalogue en 8 tranches de rang Deezer (la manche k tire dans la tranche k, la dernière se répète), mélangées par la graine et le numéro de manche, sans jamais reprendre un morceau déjà tiré. Aucune réserve de morceaux n'est gardée : un morceau retiré par Deezer est neutralisé sans conséquence.
- **Le palier est calculé, jamais stocké.** Il se déduit des réponses des manches terminées (`RunSteps.Next`) : sans vie perdue il raccourcit, avec une vie perdue il reste en place (`HoldOnLifeLost` ; les playlists d'avant le rallongeaient d'un cran), des moitiés justes le laissent. Rien à migrer si l'échelle change.
- **Les règles sont figées dans le défi** (`RunRules` en `jsonb`) : modifier un réglage ne touche que les défis à venir ; deux joueurs d'une même playlist jouent sous les mêmes règles.
- **Thème par manche fixé par le premier arrivé** : l'offre (deux thèmes) est tirée de la graine et du numéro de manche, donc stable au rechargement ; le choix est écrit une fois pour tous les joueurs de la playlist.
- **Le dernier palier se répète** : au-delà du sixième, l'écoute reste à 0,5 s et un morceau trouvé rapporte 1 200 points. Le score n'est pas borné ; le barème des disques de niveau (`Runs:Levels:Discs`) est réglable à chaud, jamais figé dans une playlist.
- **Accès sur invitation** : `runs.access` et son interrupteur dans l'admin ; le lien d'un ami se joue sans accès, cette playlist seulement.
- **Migration destructive** : la migration `SerieRules` a supprimé les tables de l'ancien mécanisme (`session_rounds`, `session_cards`, `challenge_reserve_tracks`) et vidé les parties, défis, records et niveaux de l'ancien mode, dont les règles étaient incompatibles.

## Données et API

Tables du schéma `runs` : [`CLAUDE.md`](../../CLAUDE.md) § Modèle de données. Routes, réponses, codes d'erreur (`runs.*`, jamais renommés), métriques et journaux : `src/back/CLAUDE.md`. Les clients NSwag du front sont générés depuis `openapi/runs.json`. L'effacement et l'export du joueur (piège 48) couvrent toutes les tables de `runs` portant un `player_id`.

## Tests

`UnitTests/Runs` (règles, partie, tirage, réglages, thèmes, Hits, niveau), `IntegrationTests/Runs` (jeu complet par HTTP : vies, paliers, neutralisation, chrono, fin, record, comparaison, fantôme, historique, effacement), E2E `runs.spec.ts` (accès, parties, thèmes, lien d'un ami), `groups.spec.ts`, `admin-themes.spec.ts`.
