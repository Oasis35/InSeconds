# Règles de jeu (scoring, anti-triche, streak)

> Référence unique des règles produit du blind test. Avant, ces règles étaient éparpillées entre `COMMENCE_ICI_FR.md` (rappel rapide), `BACKEND_STRUCTURE_FR.md` (formule `ScoreCalculator`) et les pièges du [`CLAUDE.md`](../CLAUDE.md) — ce qui a d'ailleurs causé une ambiguïté réelle lors d'un audit de code (le comportement exact de la prolongation "écouter plus" n'était tranché nulle part). Ce document est la source de vérité produit ; si le code diverge, c'est le code qui a raison, mais ce doc doit alors être corrigé.
>
> **2026-07-17** : la prolongation "écouter plus" a été repensée — plus de malus de score, plus de limite au nombre de prolongations. Voir la section dédiée ci-dessous pour le raisonnement.
>
> Pour chaque règle, la mention **[Back]** / **[Front]** indique où elle est réellement appliquée (utile pour savoir si modifier un `Setting` en base suffit, ou s'il faut aussi toucher au code).

## Déroulé d'une partie

- **N morceaux par jour** (`Settings.TracksPerChallenge`, défaut **5**), même défi pour tout le monde, généré à minuit UTC. **[Back]**
- Une seule session par joueur par défi — contrainte unique `(PlayerId, DailyChallengeId)`. Une partie déjà `Completed`, `Abandoned` (bouton) ou `Expired` (Pending non terminé, basculé par l'expiry paresseuse) ne peut pas être rejouée (409). Une partie `Pending` peut être reprise jusqu'à minuit. **[Back]**
- Pour chaque morceau : la lecture démarre automatiquement au premier palier (0,5 s), le joueur prolonge s'il le veut (« écouter plus »), saisit artiste + titre (ou passe si pas de preview), score calculé côté serveur.

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

## Feedback après chaque réponse

- L'écran de révélation d'un morceau affiche un **histogramme « en combien de temps les autres ont trouvé »** : une barre par palier d'écoute (`0.5s … 10s`) = nombre de joueurs ayant trouvé (artiste OU titre) à ce palier, plus une barre « ✗ » finale = nombre de joueurs n'ayant pas trouvé. La colonne du palier écouté par le joueur courant est mise en avant (ou la barre « ✗ » s'il n'a pas trouvé). Purement informatif, n'affecte pas le score. Données : `SubmitAnswerResponse.GuessTimeDistribution` + `NotFoundCount` (réponse courante incluse dans les comptes). **[Back + Front]**
- Sur le **récap final ET l'écran « déjà joué »**, le même histogramme est accessible en pop-up : cliquer le `+score` d'un morceau l'ouvre (données `TrackStat.GuessTimeDistribution`/`NotFoundCount`/`Score` via `GET /api/stats/today`). Les deux écrans partagent la même liste de morceaux (`TrackResultsListComponent`) : pochette, chips `✓/✗`, durée écoutée, `% ratés`/moyenne, `+score`.

## Stats admin sur la prolongation

- **`ExtendedRate`** (`TrackStatsDto`, `GET /api/admin/challenge-stats`) — % des réponses sur un morceau où le joueur a prolongé l'écoute au moins une fois (`WasExtended=true`). Purement informatif (n'affecte rien côté jeu), affiché dans l'onglet Défis de l'admin, tuile « Prolongé » à côté des taux artiste/titre/écoute moyenne. **[Back + Front]**
- **Histogramme admin** — `TrackStatsDto.GuessTimeDistribution`/`NotFoundCount` (`GET /api/admin/challenge-stats` — endpoint « Stats par défi » scindé de `/api/admin/stats` le 2026-08-29, chargé seulement à l'ouverture de l'onglet Défis) : une icône « graphique » sur chaque carte morceau de l'onglet Défis ouvre une pop-up avec l'histogramme « en combien de temps les autres ont trouvé » **avec les chiffres au-dessus des barres** (`GuessTimeChartComponent showCounts=true`). Purement informatif. **[Back + Front]**

## Indices (hints)

- **2 niveaux**, débloqués respectivement aux paliers d'écoute configurés dans `Settings.HintUnlockDurationsSeconds` (défaut **5s** pour le niveau 1, **10s** pour le niveau 2). Le bouton "Indice" est **masqué avant déblocage** (pas juste désactivé) — apparaît et devient utilisable dès que le joueur a **choisi** ce palier (ex. clic sur "écouter plus" jusqu'à 5s), sans attendre que l'audio ait fini de le jouer jusqu'au bout ; révélation sur **clic explicite** uniquement, jamais automatique. **[Back + Front]**
- **Contenu** : niveau 1 = année de sortie du morceau (`Track.ReleaseYear`) ; niveau 2 = **cumulatif**, ajoute le nom d'artiste masqué façon "pendu" (1re lettre de chaque mot révélée, le reste en `_`, ex. `D _ _ _   P _ _ _`). Demander directement l'indice niveau 2 renvoie les deux contenus d'un coup, que le niveau 1 ait été révélé séparément avant ou non. **[Back]**, `Common/Text/TextNormalizationHelpers.BuildHangmanPattern`.
- **Pénalité** : appliquée sur le score du **palier d'écoute réellement atteint** (`ScoreCalculator`, après le calcul base/moitié habituel), proportionnelle au **niveau max révélé** — `Settings.HintPenaltyPercent` (défaut **30%** niveau 1, **60%** niveau 2). Aucune pénalité si l'indice n'a jamais été révélé. **[Back]**
- **Anti-triche** : le niveau d'indice utilisé n'est **jamais envoyé par le client** à `SubmitAnswer` — source de vérité serveur (`GameSession.CurrentTrackHintLevelUsed`, même pattern que `CurrentTrackMinListenedSeconds`), posée par `POST /api/sessions/{id}/hint` (vérifie que le palier requis est bien atteint avant de révéler, **409** sinon) et lue au moment du calcul du score. **[Back]**
- **Interaction avec "écouter plus"** : **prolonger l'écoute seule ne coûte jamais de points liés aux indices** — cohérent avec la règle "pas de malus de prolongation" ci-dessus. Le niveau d'indice révélé garde son **maximum** (`RecordHintUsage`), il ne redescend jamais si l'utilisateur redemande un niveau inférieur, et il **n'est pas réinitialisé** par une simple prolongation d'écoute sur le même morceau (seul un changement de morceau, ou la soumission de la réponse, le remet à 0). Exemples (pénalités par défaut 30%/60%, `DurationScores[5]=250`, `DurationScores[10]=100`) :

  | Scénario | Palier final | Indice révélé | Score |
  |---|---|---|---|
  | Répond à 5s sans indice | 5s | aucun | 250 |
  | Révèle indice 1 à 5s, répond à 5s | 5s | niveau 1 | 250 × 0.70 ≈ 175 |
  | Révèle indice 1 à 5s, prolonge à 10s sans redemander, répond à 10s | 10s | niveau 1 | 100 × 0.70 = 70 |
  | Révèle indice 1 à 5s, prolonge à 10s, révèle aussi indice 2, répond à 10s | 10s | niveau 2 (max) | 100 × 0.40 = 40 |
  | Prolonge direct jusqu'à 10s sans jamais cliquer indice 1, révèle indice 2 | 10s | niveau 2 | 100 × 0.40 = 40 |

- **`Track.ReleaseYear` absent** (pool pas encore backfillé, cf. bouton admin "Re-vérifier les années de sortie") : l'indice niveau 1 renvoie `null`, le front masque simplement la pastille année — pas d'erreur, l'indice niveau 2 (artiste) reste disponible indépendamment.
- **Feedback** : `SubmitAnswerResponse.HintLevelUsed`/`HintPenaltyPercentApplied` (pourcentage **réellement appliqué**, pas à recalculer côté front) — donnée disponible mais **plus affichée** sur l'écran de révélation du blind round depuis le 2026-09-19 (retiré à la demande produit, cf. issue #153).

## Morceaux sans preview

Les morceaux `Track.HasPreview = false` ne sont jamais tirés dans un défi. Si Deezer ne renvoie malgré tout aucune URL de preview au démarrage de la session (`previewUrl` vide), le joueur ne peut pas écouter : bouton « Passer » qui soumet directement `ListenedDurationSeconds = 0` (accepté explicitement par `SubmitAnswerValidator`, seul cas où `0` est valide en dehors des paliers configurés). Score = 0 automatiquement (aucun palier ne matche `0` dans `DurationScores`).

## Anti-triche

- **Scoring 100 % serveur** — le client n'envoie que le palier choisi et le texte saisi ; `SubmitAnswerHandler` recalcule tout, le front ne fait qu'afficher le résultat renvoyé.
- **Anti-rejeu** : contrainte unique BD `(PlayerId, DailyChallengeId)` — impossible de rejouer un défi déjà `Completed`/`Abandoned`/`Expired` en re-soumettant une requête. **[Back]**
- **Durée minimale déjà écoutée (anti-reprise)** : `PATCH /api/sessions/{id}/listening` enregistre, dès que le palier écouté change (démarrage auto et chaque « écouter plus », depuis le 2026-09-19), la durée maximale déjà écoutée (`GameSession.CurrentTrackMinListenedSeconds`). Si le joueur recharge la page en pleine écoute puis reprend, les paliers plus courts que ce qui a déjà été « consommé » sont masqués — impossible de re-choisir un palier plus court après coup pour gonfler artificiellement le score. **[Back + Front]**, verrou posé côté back, filtrage des paliers affichés côté front (`BlindRoundComponent.durations` computed).
- **Durée validée serveur** : `ListenedDurationSeconds` doit appartenir à `Settings.AllowedDurationsSeconds` (sauf `0` pour le skip sans preview) — un palier inventé côté client est rejeté par `SubmitAnswerValidator`. **[Back]**

## Timer de saisie

⚠️ **`Settings.GuessTimerSeconds` (défaut 20 s) est chargé (`SettingsService` back et front) mais n'est appliqué nulle part** — aucun compte à rebours n'interrompt la saisie ni ne force une soumission automatique après ce délai. Le joueur peut aujourd'hui prendre le temps qu'il veut pour répondre après avoir écouté. À implémenter si le produit veut vraiment un timer de saisie contraignant.

## Streak

- `Player.CurrentStreak` + `Player.LastPlayedDate` mis à jour uniquement à la **complétion** d'une partie (`SubmitAnswer/Handler.cs`), jamais à l'abandon. **[Back]**
- Basée sur **`DailyChallenge.Date`**, jamais sur l'horodatage réel de complétion : `CurrentStreak += 1` si `LastPlayedDate == DailyChallenge.Date - 1 jour`, sinon reset à `1`. `LastPlayedDate` stocke alors la date du défi (pas `UtcNow`).
- Conséquence : terminer le défi de la veille après minuit UTC (ex. à 00h15) ne casse pas la streak — seul un vrai jour manqué la remet à 1. Voir piège 18 du [`CLAUDE.md`](../CLAUDE.md) pour l'historique du bug corrigé.
- **Série effective** : la valeur affichée (header, accueil, profil, récap) est recalculée à la lecture depuis `LastPlayedDate` — une série cassée s'affiche à 0 tout de suite, sans attendre la prochaine partie. **[Back]**

### Gel de série (streak freeze)

- **Comptes connectés uniquement.** Un invité n'a jamais de gel. **[Back]**
- **1 gel offert** à la création du compte (conversion invité → compte ; une reconnexion n'en redonne pas). **[Back]**
- **+1 gel à chaque multiple de `StreakFreezeEveryDays`** (7) jours de série, dans la limite de **`StreakFreezeMax`** (2). Stock plein → rien de gagné. **[Back]**
- **Panneau série (gélule → `StreakSheetComponent`)** : le bloc « Prochain gel à N jours » + barre de progression n'est affiché que si le stock n'est pas déjà au plafond (2026-09-24) — une fois à 2/2, le panneau affiche un message « Stock plein » à la place, pour ne pas annoncer un gel qui ne peut pas être gagné tant qu'aucun n'a été consommé. **[Front]**
- **Consommation automatique** : à la complétion du défi suivant, chaque jour manqué consomme un gel. La série **ne monte pas** pour le jour gelé mais **ne casse pas** (+1 pour le défi joué). Pas assez de gels pour tous les jours manqués → la série repart à 1 et les gels restent en stock. **[Back]**
- Entre-temps, une série dont les jours manqués sont couverts par le stock est **« protégée »** (gélule cyan, accueil « Bon retour ! ») ; sinon elle est **« perdue »** (0). **[Back + Front]**
- **Invité** : série perdue ≥ `StreakLostNudgeMinDays` (2) → toast « Ta série de N jours s'est arrêtée… un gel l'aurait sauvée », une seule fois par série perdue ; palier de 7 jours atteint → « Tu aurais gagné un gel ! ». **[Front]**
- Exemples (7/2) : série 12, dernier défi avant-hier, 1 gel → joue aujourd'hui → série 13, 0 gel. Série 5, week-end manqué, 2 gels → 6, 0 gel. Même cas avec 1 gel → 1, 1 gel. Série 13 → 14 avec 1 gel → 2 gels.

## Settings modifiables (table `Settings`)

| Clé | Défaut | Appliqué réellement ? |
|---|---|---|
| `TracksPerChallenge` | `5` | ✅ Back (génération du défi + détection de complétion) |
| `AllowedDurationsSeconds` | `0.50,1,1.5,2,3,5,10` | ✅ Back (validation) + Front (paliers affichés) |
| `DurationScores` | voir table ci-dessus | ✅ Back (scoring) — le front le charge mais ne l'affiche plus (tooltip des paliers retiré avec l'auto-play) |
| `TrackCooldownDays` | `30` | ✅ Back, **lu à chaud** (délai avant qu'un morceau déjà joué redevienne éligible, éditable dans l'onglet Actions admin) |
| `StreakFreezeEveryDays` / `StreakFreezeMax` / `StreakLostNudgeMinDays` | `7` / `2` / `2` | ✅ Back, **lus à chaud** (gel de série, cf. § Streak) |
| `CoverUrlTemplate` | URL Deezer | ✅ Back (reconstruction des pochettes) |
| `GuessTimerSeconds` | `20` | ❌ Non appliqué — aucun timer réel en jeu aujourd'hui |
| `HintUnlockDurationsSeconds` | `5,10` | ✅ Back (déblocage server-side via `RequestHint`) + Front (affichage des boutons) |
| `HintPenaltyPercent` | `1:30,2:60` | ✅ Back (pénalité appliquée dans `ScoreCalculator`) |

Détail du mécanisme de chargement (`AppDbConfigurationSource`, `IOptions<AppSettings>`) : voir [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md#settings--chargement-au-boot) et [`CLAUDE.md`](../CLAUDE.md).
