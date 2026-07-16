# Règles de jeu (scoring, anti-triche, streak)

> Référence unique des règles produit du blind test. Avant, ces règles étaient éparpillées entre `COMMENCE_ICI_FR.md` (rappel rapide), `BACKEND_STRUCTURE_FR.md` (formule `ScoreCalculator`) et les pièges du [`CLAUDE.md`](../CLAUDE.md) — ce qui a d'ailleurs causé une ambiguïté réelle lors d'un audit de code (le comportement exact de la prolongation "écouter plus" n'était tranché nulle part). Ce document est la source de vérité produit ; si le code diverge, c'est le code qui a raison, mais ce doc doit alors être corrigé.
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

- Après avoir écouté un palier, le joueur peut prolonger l'écoute jusqu'au palier suivant **une seule fois** par morceau (`AudioPlayerService.extend()`), sans relire depuis le début — la lecture continue là où elle s'était arrêtée (ou reprend si le palier initial s'est déjà terminé naturellement). **[Front]**
- Utiliser la prolongation applique un **malus de 25 %** sur le score de base (`baseScore * 0.75`), en plus du score déjà plus bas du palier final choisi. **[Back]**, dans `ScoreCalculator.Calculate` via le flag `WasExtended`.
- ⚠️ **`Settings.MaxExtensionsPerAnswer` (défaut 1) est chargé mais n'est actuellement appliqué nulle part** — ni back ni front ne lisent cette valeur pour autoriser plus d'une prolongation. La limite réelle observée est **codée en dur à 1** côté front (`AudioPlayerService.extend()` refuse toute deuxième prolongation via un booléen interne, indépendamment de la valeur du setting). Changer ce setting en base n'aurait aujourd'hui aucun effet — il faudrait aussi réécrire `extend()` pour lire `Settings.MaxExtensionsPerAnswer`.

## Scoring partiel

- `ArtistCorrect` et `TitleCorrect` sont évalués séparément (comparaison via `TextNormalizer.IsMatch`, tolérance Levenshtein ≤ 2 caractères après normalisation — accents supprimés, parenthèses/crochets ignorés, stop-words filtrés). **[Back]**
- Aucun des deux correct → **score = 0**.
- Un seul des deux correct (artiste OU titre) → **score de base × 0,5** (après malus prolongation éventuel).
- Les deux corrects → score de base plein (après malus prolongation éventuel).

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
| `MaxExtensionsPerAnswer` | `1` | ❌ Non lu — limite réelle codée en dur à 1 côté front |
| `GuessTimerSeconds` | `20` | ❌ Non appliqué — aucun timer réel en jeu aujourd'hui |

Détail du mécanisme de chargement (`AppDbConfigurationSource`, `IOptions<AppSettings>`) : voir [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md#settings--chargement-au-boot) et [`CLAUDE.md`](../CLAUDE.md).
