# Règles de jeu (scoring, anti-triche, streak)

> Référence unique des règles produit du blind test. Avant, ces règles étaient éparpillées entre `COMMENCE_ICI_FR.md` (rappel rapide), `BACKEND_STRUCTURE_FR.md` (formule `ScoreCalculator`) et les pièges du [`CLAUDE.md`](../CLAUDE.md) — ce qui a d'ailleurs causé une ambiguïté réelle lors d'un audit de code (le comportement exact de la prolongation "écouter plus" n'était tranché nulle part). Ce document est la source de vérité produit ; si le code diverge, c'est le code qui a raison, mais ce doc doit alors être corrigé.
>
> **2026-07-17** : la prolongation "écouter plus" a été repensée — plus de malus de score, plus de limite au nombre de prolongations. Voir la section dédiée ci-dessous pour le raisonnement.
>
> Pour chaque règle, la mention **[Back]** / **[Front]** indique où elle est réellement appliquée (utile pour savoir si modifier un réglage en base suffit, ou s'il faut aussi toucher au code).
>
> **2026-10-12 (PR G4)** : références mises à jour pour la v2 (réglages `Daily:*` de `infra.settings`, modules `Daily` et `Gameplay`, routes `/api/daily/…`). Les règles sont celles de la v1, reprises à l'identique, sauf mention contraire.

## Déroulé d'une partie

- **N morceaux par jour** (`Daily:TracksPerChallenge`, défaut **5**), même défi pour tout le monde, généré à minuit UTC (tâche `daily-generate-challenge`, ou à la volée par le premier joueur si elle a raté ; même tirage dans les deux cas). Un défi déjà généré garde son nombre de morceaux si le réglage change. **[Back]**
- Une seule partie par joueur et par défi — contrainte unique `(player_id, challenge_id)` de `daily.sessions`. Une partie terminée, abandonnée (bouton) ou expirée (laissée en cours sur un défi passé) ne peut pas être rejouée (409 `daily.already_played` / `daily.abandoned`). Une partie en cours se reprend le jour même. **[Back]**
- La veille reste jouable après minuit dans un onglet resté ouvert (ses réponses sont acceptées) ; au-delà, une partie en cours est refusée (409 `daily.abandoned`) et la tâche `daily-close-day` (0 h 05 UTC) l'expire. **[Back]**
- Pour chaque morceau : la lecture démarre au premier palier (0,5 s) — le son ne part qu'après un clic du joueur (« Commencer », « Reprendre », « Piste suivante »), condition des navigateurs mobiles —, le joueur prolonge s'il le veut (« écouter plus »), saisit artiste + titre (ou passe si pas de preview), score calculé côté serveur. L'écoute automatique n'a lieu qu'une fois par morceau. **[Front]**

## Paliers d'écoute et barème de points

Paliers configurables (`Daily:AllowedDurationsSeconds`), score par palier (`Daily:DurationScores`) — valeurs par défaut :

| Palier écouté | Score de base |
|---|---|
| 0.5 s | 1000 |
| 1 s | 850 |
| 1.5 s | 700 |
| 2 s | 550 |
| 3 s | 400 |
| 5 s | 250 |
| 10 s | 100 |

Moins on écoute, plus on marque. Le score de base est un **lookup exact** du palier réellement écouté — pas d'interpolation entre paliers. **[Back]**, calcul dans `DurationScoringPolicy` (`Modules/Daily/Domain/DailyScoring.cs`, barème de la v1 repris tel quel, arrondis compris).

## Prolongation « écouter plus »

- Après avoir écouté un palier, le joueur peut prolonger l'écoute jusqu'au palier suivant, **autant de fois qu'il veut**, jusqu'au dernier palier configuré (manche `gameplay/domain/track-round.ts`, lecteur `HtmlAudioPort`). **[Front]**
- **Comportement dual selon que l'audio joue encore ou non** :
  - Si l'audio est **en cours de lecture**, la prolongation continue sans coupure — pas de replay de l'intro, l'arrêt est simplement repoussé au nouveau palier.
  - Si l'audio **n'est pas en cours de lecture** (palier précédent déjà terminé), la prolongation **relit le morceau depuis le début** jusqu'au nouveau palier.
- **Aucun malus de score** : le score ne dépend que du **palier finalement écouté** — qu'il ait été atteint directement au premier choix ou via une ou plusieurs prolongations, le calcul est strictement identique (le barème ne lit pas `wasExtended`). **[Back]**
  - Raisonnement produit : le barème par palier (ci-dessus) est déjà dégressif — écouter plus longtemps rapporte déjà moins de points. Ajouter un malus *en plus* du barème pénalisait deux fois un joueur parti prudent sur un petit palier (ex. 0,5s) qui doit ensuite prolonger : il finissait avec **moins de points qu'un joueur ayant choisi le palier final directement**, pour un temps d'écoute identique — ce qui décourageait exactement la stratégie qu'on veut encourager (tenter petit, sécuriser si besoin).
- `was_extended` (`daily.answers`) reste enregistré (à des fins de stats admin uniquement, voir plus bas), mais n'a aucun effet sur le calcul du score. La relecture (↺) après la réponse ne l'efface pas.
- Il n'y a pas de nombre maximal de prolongations (l'ancien réglage `MaxExtensionsPerAnswer`, jamais appliqué, a été supprimé en v1).

## Scoring partiel

- L'artiste et le titre sont évalués séparément (`FuzzyAnswerMatcher`, module Gameplay) : casse, accents, parenthèses et crochets, ponctuation et mots vides (`the le la les un une de du des and et feat ft vs`) ignorés, puis distance de Levenshtein ≤ **min(2, longueur de la référence ÷ 3)** — moins de 3 caractères : égalité stricte ; 3 à 5 : une faute. Seuil calculé sur la référence, pas sur la saisie. Une saisie de plus de 600 caractères est refusée. **[Back]**
- Aucun des deux correct → **score = 0**.
- Un seul des deux correct (artiste OU titre) → **score de base × 0,5** (du palier finalement écouté).
- Les deux corrects → score de base plein (du palier finalement écouté).

## Feedback après chaque réponse

- L'écran de révélation d'un morceau affiche un **histogramme « en combien de temps les autres ont trouvé »** : une barre par palier d'écoute (`0.5s … 10s`) = nombre de joueurs ayant trouvé (artiste OU titre) à ce palier, plus une barre « ✗ » finale = nombre de joueurs n'ayant pas trouvé. La colonne du palier écouté par le joueur courant est mise en avant (ou la barre « ✗ » s'il n'a pas trouvé). Purement informatif, n'affecte pas le score. Données : la réponse de `POST /api/daily/sessions/{id}/answers` (réponse courante incluse dans les comptes ; joueurs supprimés exclus). **[Back + Front]**
- Sur le **récap final ET l'écran « déjà joué »**, le même histogramme est accessible en pop-up : cliquer le `+score` d'un morceau l'ouvre (données de `GET /api/daily/stats/today`). Les deux écrans partagent la même liste de morceaux (`track-results-list` du domaine `daily`) : pochette, chips `✓/✗`, durée écoutée, `% ratés`/moyenne, `+score`.

## Répartition des scores du jour

- Le **récap final ET l'écran « déjà joué »** affichent sous le score un **égaliseur** : 10 colonnes de même largeur couvrant 0 → score maximal possible du défi (nb de morceaux × meilleur palier, 5 000 par défaut), chaque colonne allumée selon le nombre de joueurs dont le score tombe dans cette tranche (sessions `Completed` uniquement). La colonne du joueur est en orange. Sous l'axe : le score le **plus bas** (bord gauche), la **médiane** (trait cyan pointillé, valeur dessous) et le score le **plus haut** (bord droit) du jour ; les repères sont à leur vraie position, les étiquettes restent lisibles aux bords. L'écran « déjà joué » n'a plus de case « Médiane » à côté du score. **[Back + Front]**
- Phrase **« Tu fais mieux que X % des joueurs »** = part des *autres* joueurs du jour dont le score est strictement inférieur (égalités non comptées), arrondie. Masquée sous **5 joueurs** (graphique toujours affiché) et quand le joueur est seul. Aucun chiffre au-dessus des colonnes. Données : `scoreDistribution`, `minScore`, `maxScore`, `maxPossibleScore`, `betterThanPercent` de `GET /api/daily/stats/today`. Les morceaux du jour (`tracks`) n'y sont remplis que pour un joueur dont la partie est finie.

## Stats admin sur la prolongation

- **Taux de prolongation** (par morceau, `GET /api/admin/daily/challenges/stats`) — % des réponses sur un morceau où le joueur a prolongé l'écoute au moins une fois (`WasExtended=true`). Purement informatif (n'affecte rien côté jeu), affiché dans l'onglet Défis de l'admin, tuile « Prolongé » à côté des taux artiste/titre/écoute moyenne. **[Back + Front]**
- **Histogramme admin** — même route, chargée à l'ouverture de l'onglet Défis : une icône « graphique » sur chaque carte morceau ouvre une pop-up avec l'histogramme « en combien de temps les autres ont trouvé » **avec les chiffres au-dessus des barres**. Purement informatif. **[Back + Front]**
- **Photo figée** — les statistiques d'un jour terminé (J-2 et avant) sont figées par la tâche `daily-close-day`, avec les paliers et le barème de ce jour-là ; un bouton « Recalculer les stats » de l'onglet Défis les refait. La veille et le jour même sont calculés en direct. **[Back]**

## Indices (hints)

- **2 niveaux**, débloqués respectivement aux paliers d'écoute configurés dans `Daily:HintUnlockDurationsSeconds` (défaut **5s** pour le niveau 1, **10s** pour le niveau 2). Le bouton "Indice" est **masqué avant déblocage** (pas juste désactivé) — apparaît et devient utilisable dès que le joueur a **choisi** ce palier (ex. clic sur "écouter plus" jusqu'à 5s), sans attendre que l'audio ait fini de le jouer jusqu'au bout ; révélation sur **clic explicite** uniquement, jamais automatique. **[Back + Front]**
- **Contenu** : niveau 1 = année de sortie du morceau (`catalogue.tracks.release_year`) ; niveau 2 = **cumulatif**, ajoute le nom d'artiste masqué façon "pendu" (1re lettre de chaque mot révélée, le reste en `_`, ex. `D _ _ _   P _ _ _`). Demander directement l'indice niveau 2 renvoie les deux contenus d'un coup, que le niveau 1 ait été révélé séparément avant ou non. **[Back]**, fournisseurs `YearHint` et `HangmanArtistHint` (module Gameplay) : un indice de plus = un fournisseur de plus.
- **Pénalité** : appliquée sur le score du **palier d'écoute réellement atteint** (`DurationScoringPolicy`, après le calcul base/moitié habituel), proportionnelle au **niveau max révélé** — `Daily:HintPenaltyPercent` (défaut **30%** niveau 1, **60%** niveau 2). Aucune pénalité si l'indice n'a jamais été révélé. **[Back]**
- **Anti-triche** : le niveau d'indice utilisé n'est **jamais envoyé par le client** avec la réponse — source de vérité serveur (`daily.sessions.current_hint_level`, comme le plancher d'écoute), posée par `POST /api/daily/sessions/{id}/hints` (vérifie que la durée d'écoute vue par le serveur atteint le seuil, **409** `daily.hint_locked` sinon) et lue au moment du calcul du score. **[Back]**
- **Interaction avec "écouter plus"** : **prolonger l'écoute seule ne coûte jamais de points liés aux indices** — cohérent avec la règle "pas de malus de prolongation" ci-dessus. Le niveau d'indice révélé garde son **maximum** (`TrackRound.RevealHint`), il ne redescend jamais si l'utilisateur redemande un niveau inférieur, et il **n'est pas réinitialisé** par une simple prolongation d'écoute sur le même morceau (seul un changement de morceau, ou la soumission de la réponse, le remet à 0). Exemples (pénalités par défaut 30%/60%, `DurationScores[5]=250`, `DurationScores[10]=100`) :

  | Scénario | Palier final | Indice révélé | Score |
  |---|---|---|---|
  | Répond à 5s sans indice | 5s | aucun | 250 |
  | Révèle indice 1 à 5s, répond à 5s | 5s | niveau 1 | 250 × 0.70 ≈ 175 |
  | Révèle indice 1 à 5s, prolonge à 10s sans redemander, répond à 10s | 10s | niveau 1 | 100 × 0.70 = 70 |
  | Révèle indice 1 à 5s, prolonge à 10s, révèle aussi indice 2, répond à 10s | 10s | niveau 2 (max) | 100 × 0.40 = 40 |
  | Prolonge direct jusqu'à 10s sans jamais cliquer indice 1, révèle indice 2 | 10s | niveau 2 | 100 × 0.40 = 40 |

- **Année absente** (inconnue de Deezer, qui renvoie `0000-00-00`) : l'indice niveau 1 renvoie `null`, le front masque simplement la pastille année — pas d'erreur, l'indice niveau 2 (artiste) reste disponible indépendamment.
- **Feedback** : `hintLevelUsed`/`hintPenaltyPercentApplied` de la réponse (pourcentage **réellement appliqué**, pas à recalculer côté front) — donnée disponible mais **pas affichée** sur l'écran de révélation depuis le 2026-09-19 (retiré à la demande produit, cf. issue #153).

## Passer un morceau

Pendant l'écoute, un bouton **« Passer (0 pts) »** sous « Valider » permet d'abandonner le morceau en cours sans répondre. Il demande une confirmation (même encart que la confirmation d'une réponse vide), puis envoie une réponse vide au palier déjà écouté : **0 point**, le morceau compte comme « pas trouvé » dans les stats. Aucune règle serveur spécifique : c'est une réponse vide ordinaire. **[Front]**

## Morceaux sans preview

Seuls les morceaux dont l'extrait est **disponible** (`preview_status` = 1, jamais « inconnu ») et non désactivés sont tirés dans un défi. Si Deezer ne renvoie malgré tout aucune URL d'extrait au démarrage de la partie (`previewUrl` vide), le joueur ne peut pas écouter : bouton « Passer » qui soumet directement une durée de `0` (seul cas où `0` est valide en dehors des paliers configurés ; un morceau jamais écouté n'a pas de plancher). Score = 0 automatiquement (aucun palier ne correspond à `0` dans `Daily:DurationScores`).

## Anti-triche

- **Scoring 100 % serveur** — le client n'envoie que le palier choisi et le texte saisi ; le serveur recalcule tout, le front ne fait qu'afficher le résultat renvoyé.
- **Rien qui identifie le morceau avant la réponse** — ni artiste, ni titre, ni année, ni identifiant Deezer au démarrage de la partie ; pochette et lien Deezer n'arrivent qu'avec la réponse. **[Back]**
- **Anti-rejeu** : contrainte unique `(player_id, challenge_id)` — impossible de rejouer un défi déjà terminé, abandonné ou expiré en re-soumettant une requête ; une seule réponse par morceau (clé `(session_id, position)`). **[Back]**
- **Verrou du morceau en cours** : le morceau en cours est le premier sans réponse, un autre morceau ne peut pas prendre le verrou (409 `daily.track_lock_not_released`). **[Back]**
- **Plancher d'écoute** : `PATCH /api/daily/sessions/{id}/listening` enregistre, dès que le palier écouté change (démarrage et chaque « écouter plus »), la durée maximale déjà écoutée (`daily.sessions.current_listened_seconds`, jamais réduite). Une réponse qui annonce un palier plus court est **refusée** (400 `daily.listened_duration_below_verified_minimum`, nouveau en v2 : la v1 se contentait de masquer les paliers), et à la reprise après un rechargement les paliers plus courts ne sont pas proposés. **[Back + Front]**
- **Durée validée serveur** : un palier qui n'est pas dans `Daily:AllowedDurationsSeconds` (sauf `0` pour un morceau sans extrait) est refusé par la validation de la réponse (400). **[Back]**

## Timer de saisie

⚠️ **`Daily:GuessTimerSeconds` (défaut 20 s) est exposé par `GET /api/daily/settings` et lu par le front, mais n'est appliqué nulle part** — aucun compte à rebours n'interrompt la saisie ni ne force une soumission automatique après ce délai. Le joueur peut aujourd'hui prendre le temps qu'il veut pour répondre après avoir écouté. À implémenter si le produit veut vraiment un timer de saisie contraignant.

## Streak

- `daily.streaks` (`current_streak`, `last_played_date`, `freezes`) mis à jour uniquement à la **complétion** d'une partie (`DailyStreak.RecordCompletion`, dans la transaction de la dernière réponse), jamais à l'abandon. **[Back]**
- Basée sur **la date du défi**, jamais sur l'heure réelle de complétion : la série monte de 1 si `last_played_date` = date du défi − 1 jour, sinon elle repart à `1` (hors gels, ci-dessous). `last_played_date` stocke la date du défi.
- Conséquence : terminer le défi de la veille après minuit UTC (ex. à 00h15) ne casse pas la streak — seul un vrai jour manqué la remet à 1. Voir piège 18 du [`CLAUDE.md`](../CLAUDE.md) pour l'historique du bug corrigé.
- **Série effective** : la valeur affichée (en-tête, accueil, récap, admin) est recalculée à la lecture (`DailyStreak.Compute`) — une série cassée s'affiche à 0 tout de suite, sans attendre la prochaine partie. **[Back]**

### Gel de série (streak freeze)

- **Comptes connectés uniquement.** Un invité n'a jamais de gel. **[Back]**
- **1 gel offert** à la création du compte (conversion invité → compte ; une reconnexion n'en redonne pas). **[Back]**
- **+1 gel à chaque multiple de `Daily:StreakFreezeEveryDays`** (7) jours de série, dans la limite de **`Daily:StreakFreezeMax`** (2). Stock plein → rien de gagné. **[Back]**
- **Panneau série (gélule → `streak-sheet`)** : le bloc « Prochain gel à N jours » + barre de progression n'est affiché que si le stock n'est pas déjà au plafond (2026-09-24) — une fois à 2/2, le panneau affiche un message « Stock plein » à la place, pour ne pas annoncer un gel qui ne peut pas être gagné tant qu'aucun n'a été consommé. **[Front]**
- **Consommation automatique** : à la complétion du défi suivant, chaque jour manqué consomme un gel. La série **ne monte pas** pour le jour gelé mais **ne casse pas** (+1 pour le défi joué). Pas assez de gels pour tous les jours manqués → la série repart à 1 et les gels restent en stock. **[Back]**
- **Affichage d'une série protégée** : avant de rejouer, les gels qui couvriront les jours manqués sont déjà retirés du compteur affiché (gélule de l'en-tête, panneau, onglet Joueurs admin), même si le stock en base ne baisse qu'à la complétion. Ex. : 2 gels, hier manqué → la gélule affiche 1. **[Back]**
- Entre-temps, une série dont les jours manqués sont couverts par le stock est **« protégée »** (gélule cyan, accueil « Bon retour ! ») ; sinon elle est **« perdue »** (0). **[Back + Front]**
- **Invité** : série perdue ≥ `Daily:StreakLostNudgeMinDays` (2) → toast « Ta série de N jours s'est arrêtée… un gel l'aurait sauvée », une seule fois par série perdue ; palier de 7 jours atteint → « Tu aurais gagné un gel ! ». **[Front]**
- Exemples (7/2) : série 12, dernier défi avant-hier, 1 gel → joue aujourd'hui → série 13, 0 gel. Série 5, week-end manqué, 2 gels → 6, 0 gel. Même cas avec 1 gel → 1, 1 gel. Série 13 → 14 avec 1 gel → 2 gels.

## Réglages modifiables (`infra.settings`)

Tous relus à chaud (`IOptionsMonitor`), sans redémarrage. L'API refuse de démarrer si les réglages du jeu sont incohérents (plus de niveaux d'indice que de fournisseurs, seuils non croissants, paliers ou pourcentages aberrants).

| Clé | Défaut | Appliqué réellement ? |
|---|---|---|
| `Daily:TracksPerChallenge` | `5` | ✅ Back (génération des défis à venir ; la fin de partie compte les morceaux réels du défi) |
| `Daily:AllowedDurationsSeconds` | `[0.5,1,1.5,2,3,5,10]` | ✅ Back (scoring, histogrammes) + Front (paliers proposés) |
| `Daily:DurationScores` | voir table ci-dessus | ✅ Back (scoring) |
| `Daily:TrackCooldownDays` | `30` (40 en prod) | ✅ Back (délai avant qu'un morceau déjà joué redevienne tirable, modifiable dans l'onglet Actions admin) |
| `Daily:StreakFreezeEveryDays` / `StreakFreezeMax` / `StreakLostNudgeMinDays` | `7` / `2` / `2` | ✅ Back (gel de série, cf. § Streak) |
| `Catalogue:CoverUrlTemplate` | URL Deezer | ✅ Back (reconstruction des pochettes depuis leur hash) |
| `Daily:GuessTimerSeconds` | `20` | ❌ Non appliqué — aucun timer réel en jeu aujourd'hui |
| `Daily:HintUnlockDurationsSeconds` | `[5,10]` | ✅ Back (déblocage côté serveur) + Front (affichage des boutons) |
| `Daily:HintPenaltyPercent` | `{"1":30,"2":60}` | ✅ Back (pénalité appliquée au score) |

Mécanisme de chargement : [`CLAUDE.md`](../CLAUDE.md) (§ Réglages) et [`src/v2/back/CLAUDE.md`](../src/v2/back/CLAUDE.md) (§ Réglages).
