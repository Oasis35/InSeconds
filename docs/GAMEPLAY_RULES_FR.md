# Règles de jeu (scoring, anti-triche, streak)

> Référence unique des règles produit du blind test. Avant, ces règles étaient éparpillées entre `COMMENCE_ICI_FR.md` (rappel rapide), `BACKEND_STRUCTURE_FR.md` (formule `ScoreCalculator`) et les pièges du [`CLAUDE.md`](../CLAUDE.md) — ce qui a d'ailleurs causé une ambiguïté réelle lors d'un audit de code (le comportement exact de la prolongation "écouter plus" n'était tranché nulle part). Ce document est la source de vérité produit ; si le code diverge, c'est le code qui a raison, mais ce doc doit alors être corrigé.
>
> **2026-07-17** : la prolongation "écouter plus" a été repensée — plus de malus de score, plus de limite au nombre de prolongations. Voir la section dédiée ci-dessous pour le raisonnement.
>
> Pour chaque règle, la mention **[Back]** / **[Front]** indique où elle est réellement appliquée (utile pour savoir si modifier un `Setting` en base suffit, ou s'il faut aussi toucher au code).

## Déroulé d'une partie

- **N morceaux par jour** (`Settings.TracksPerChallenge`, défaut **3**), même défi pour tout le monde, généré à minuit UTC. **[Back]**
- Une seule session par joueur par défi — contrainte unique `(PlayerId, DailyChallengeId)`. Une partie déjà `Completed` ou `Abandoned` ne peut pas être rejouée (409). Une partie `Pending` peut être reprise jusqu'à minuit. **[Back]**
- Pour chaque morceau : le joueur choisit un palier d'écoute, écoute, saisit artiste + titre (ou passe si pas de preview), score calculé côté serveur.

## Paliers d'écoute et barème de points

Paliers configurables (`Settings.AllowedDurationsSeconds`), score par palier (`Settings.DurationScores`) — valeurs par défaut :

| Palier écouté | Score de base |
|---|---|
| 0.5 s | 1000 |
| 1 s | 850 |
| 1.5 s | 700 |
| 2 s | 550 |
| 3 s | 400 |
| 5 s | 250 |
| 10 s | 100 |

Moins on écoute, plus on marque. Le score de base est un **lookup exact** du palier réellement écouté — pas d'interpolation entre paliers. **[Back]**, calcul dans `ScoreCalculator.Calculate`.

## Prolongation « écouter plus »

- Après avoir écouté un palier, le joueur peut prolonger l'écoute jusqu'au palier suivant, **autant de fois qu'il veut**, jusqu'au dernier palier configuré (`AudioPlayerService.extend()`, appelé depuis `BlindRoundComponent.listenMore()`). **[Front]**
- **Comportement dual selon que l'audio joue encore ou non** :
  - Si l'audio est **en cours de lecture**, la prolongation continue depuis la position réelle (`audio.currentTime`) — pas de replay de l'intro, juste un reschedule de l'arrêt automatique au nouveau palier.
  - Si l'audio **n'est pas en cours de lecture** (palier précédent déjà terminé, ou état `idle`), la prolongation **relit le morceau depuis le début** jusqu'au nouveau palier.
- **Aucun malus de score** : le score ne dépend que du **palier finalement écouté** — qu'il ait été atteint directement au premier choix ou via une ou plusieurs prolongations, le calcul est strictement identique (`ScoreCalculator.Calculate` ne prend plus `wasExtended` en paramètre). **[Back]**
  - Raisonnement produit : le barème par palier (ci-dessus) est déjà dégressif — écouter plus longtemps rapporte déjà moins de points. Ajouter un malus *en plus* du barème pénalisait deux fois un joueur parti prudent sur un petit palier (ex. 0,5s) qui doit ensuite prolonger : il finissait avec **moins de points qu'un joueur ayant choisi le palier final directement**, pour un temps d'écoute identique — ce qui décourageait exactement la stratégie qu'on veut encourager (tenter petit, sécuriser si besoin).
- `GameSessionAnswer.WasExtended` reste enregistré (à des fins de stats admin uniquement, voir plus bas), mais n'a plus aucun effet sur le calcul du score.
- Le setting `Settings.MaxExtensionsPerAnswer` (qui n'a jamais été réellement appliqué nulle part, ni back ni front) a été **supprimé** (migration `RemoveMaxExtensionsPerAnswerSetting`) — il n'y a plus de notion de nombre maximal de prolongations à configurer.

## Scoring partiel

- `ArtistCorrect` et `TitleCorrect` sont évalués séparément (comparaison via `TextNormalizer.IsMatch`, tolérance Levenshtein ≤ 2 caractères après normalisation — accents supprimés, parenthèses/crochets ignorés, stop-words filtrés). **[Back]**
- Aucun des deux correct → **score = 0**.
- Un seul des deux correct (artiste OU titre) → **score de base × 0,5** (du palier finalement écouté).
- Les deux corrects → score de base plein (du palier finalement écouté).

## Stats admin sur la prolongation

- **`ExtendedRate`** (`TrackStatsDto`, `GET /api/admin/stats`) — % des réponses sur un morceau où le joueur a prolongé l'écoute au moins une fois (`WasExtended=true`). Purement informatif (n'affecte rien côté jeu), affiché dans l'onglet Défis de l'admin, tuile « Prolongé » à côté des taux artiste/titre/écoute moyenne. **[Back + Front]**

## Morceaux sans preview

Si `Track.HasPreview = false`, le joueur ne peut pas écouter : bouton « Passer » qui soumet directement `ListenedDurationSeconds = 0` (accepté explicitement par `SubmitAnswerValidator`, seul cas où `0` est valide en dehors des paliers configurés). Score = 0 automatiquement (aucun palier ne matche `0` dans `DurationScores`).

## Anti-triche

- **Scoring 100 % serveur** — le client n'envoie que le palier choisi et le texte saisi ; `SubmitAnswerHandler` recalcule tout, le front ne fait qu'afficher le résultat renvoyé.
- **Anti-rejeu** : contrainte unique BD `(PlayerId, DailyChallengeId)` — impossible de rejouer un défi déjà `Completed`/`Abandoned` en re-soumettant une requête. **[Back]**
- **Durée minimale déjà écoutée (anti-reprise)** : `PATCH /api/sessions/{id}/listening` enregistre, à chaque arrêt du timer sur un morceau, la durée maximale déjà écoutée (`GameSession.CurrentTrackMinListenedSeconds`). Si le joueur recharge la page en pleine écoute puis reprend, les paliers plus courts que ce qui a déjà été « consommé » sont masqués — impossible de re-choisir un palier plus court après coup pour gonfler artificiellement le score. **[Back + Front]**, verrou posé côté back, filtrage des paliers affichés côté front (`BlindRoundComponent.durations` computed).
- **Durée validée serveur** : `ListenedDurationSeconds` doit appartenir à `Settings.AllowedDurationsSeconds` (sauf `0` pour le skip sans preview) — un palier inventé côté client est rejeté par `SubmitAnswerValidator`. **[Back]**

## Timer de saisie

⚠️ **`Settings.GuessTimerSeconds` (défaut 20 s) est chargé (`SettingsService` back et front) mais n'est appliqué nulle part** — aucun compte à rebours n'interrompt la saisie ni ne force une soumission automatique après ce délai. Le joueur peut aujourd'hui prendre le temps qu'il veut pour répondre après avoir écouté. À implémenter si le produit veut vraiment un timer de saisie contraignant.

## Streak

- `Player.CurrentStreak` + `Player.LastPlayedDate` mis à jour uniquement à la **complétion** d'une partie (`SubmitAnswer/Handler.cs`), jamais à l'abandon. **[Back]**
- Basée sur **`DailyChallenge.Date`**, jamais sur l'horodatage réel de complétion : `CurrentStreak += 1` si `LastPlayedDate == DailyChallenge.Date - 1 jour`, sinon reset à `1`. `LastPlayedDate` stocke alors la date du défi (pas `UtcNow`).
- Conséquence : terminer le défi de la veille après minuit UTC (ex. à 00h15) ne casse pas la streak — seul un vrai jour manqué la remet à 1. Voir piège 18 du [`CLAUDE.md`](../CLAUDE.md) pour l'historique du bug corrigé.

## Settings modifiables (table `Settings`)

| Clé | Défaut | Appliqué réellement ? |
|---|---|---|
| `TracksPerChallenge` | `3` | ✅ Back (génération du défi + détection de complétion) |
| `AllowedDurationsSeconds` | `0.50,1,1.5,2,3,5,10` | ✅ Back (validation) + Front (paliers affichés) |
| `DurationScores` | voir table ci-dessus | ✅ Back (scoring) + Front (tooltip points) |
| `CoverUrlTemplate` | URL Deezer | ✅ Back (reconstruction des pochettes) |
| `GuessTimerSeconds` | `20` | ❌ Non appliqué — aucun timer réel en jeu aujourd'hui |

Détail du mécanisme de chargement (`AppDbConfigurationSource`, `IOptions<AppSettings>`) : voir [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md#settings--chargement-au-boot) et [`CLAUDE.md`](../CLAUDE.md).
