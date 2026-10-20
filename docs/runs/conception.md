# Run (Platines) : conception technique du proto 1

17/10/2026, sur la base d'`env/staging` au commit `629ca5c`, revue après une relecture indépendante du plan et après les maquettes. Règles : [`regles.md`](regles.md). Écrans : [`ecrans.md`](ecrans.md). Ordre des PR : [`plan.md`](plan.md#découpage-du-proto-1-en-pr).

## 1. Principe

Platines est un **second mode**, rangé dans le module back `Runs` et le domaine front `runs/` que l'architecture lui réserve. Il ne voit que les `Contracts` de Players, Catalogue et Gameplay ; **Daily et Runs ne se voient jamais**. Rien n'est modifié dans Daily, sauf là où Players et Catalogue doivent cesser de ne connaître que Daily (§ 6) et où un composant d'écran du Daily devient commun (§ 5.3).

```
            Daily ───────✕─────── Runs          (un mode ne voit jamais l'autre)
              │  \               /  │
              │   └──► Gameplay ◄┘  │           TrackRound, IAnswerMatcher, ISeededShuffle
              ▼           ▼         ▼
     Players/Contracts   Catalogue/Contracts    ICurrentPlayer, IPlayerDirectory, IPlayerDataContributor / ITrackDirectory, ITrackPreviews, ITrackUsage
```

Nom technique `Runs` partout (module, schéma, routes, clés de réglage, dossier front) ; « Platines » n'existe que dans les traductions.

## 2. Ce qui est réutilisé tel quel

| Besoin | Existant |
|---|---|
| Écoute, correction artiste/titre | `Gameplay.Contracts.TrackRound` (`Listen`, `Answer`), `RoundOutcome` sans points. En run, la durée annoncée est toujours la durée fixe : le plancher d'écoute ne joue aucun rôle |
| Pas d'indice au proto 1 | `HintPolicy.None` |
| Correction tolérante | `IAnswerMatcher` (`FuzzyAnswerMatcher`) |
| Tirage | `ISeededShuffle` (`FisherYatesShuffle`), graine tirée par `RandomNumberGenerator`, jamais exposée |
| Morceaux jouables, noms, pochette | `ITrackDirectory.ListPlayableIdsAsync` / `GetAsync` |
| Extraits signés | `ITrackPreviews.GetUrlsAsync`, **un morceau à la fois** (§ 3.4) |
| Joueur courant, invité, pseudo | `ICurrentPlayer`, `IPlayerDirectory` (`HasAccountAsync`, `GetPseudosAsync`) ; un ami sans identité passe par `POST /api/players/guest` comme au Daily |
| Verrou de démarrage | `pg_advisory_xact_lock` par joueur, comme `EfDailyStore.LockPlayerStartAsync` |
| Front : la manche | `gameplay/` : `withTrackRound` (phases jusqu'à `revealed`), `app-track-round` et ses emplacements `[roundActions]`, `[roundBadge]`, `[roundScore]`, `[roundNext]`, `RoundPlayerComponent`, `AnswerInputComponent`, `RevealCardComponent` (forme de la pochette) ; `ListenPolicy { steps: [10], extendable: false }` |
| Front : frontières | `sheriff.config.ts` déclare déjà `runs: ['domain:gameplay']` |

## 3. Back : le module `Runs`

```
Modules/Runs/
├── RunsModule.cs                 AddRuns() : options, store, politiques, contributeurs, contrôle des réglages
├── Domain/
│   ├── RunChallenge.cs           le défi : les 20 morceaux tirés, les règles figées
│   ├── RunSession.cs             la partie d'un joueur sur un défi (verrou, jauge, fin)
│   ├── RunRules.cs               photo des règles au départ (manches, morceaux par manche, écoute, seuils, multiplicateurs)
│   ├── DiscLadder.cs             manches passées → disque (une clé de traduction, jamais un texte)
│   ├── IRunTrackSelector.cs      tirage par difficulté (port)
│   ├── IRunScoringPolicy.cs      points d'un morceau (port)
│   └── IRunsStore.cs             écritures (port nommé par l'intention)
├── Application/                  endpoints Wolverine.Http (LoadAsync / Validate / Post), RunsOptions, RunsErrorCodes, RunsProblems, RunsMetrics, RunsTrackUsage, RunsPlayerData
└── Persistence/                  EF : configurations, EfRunsStore, EfRunsQueries
```

### 3.1 Les agrégats
Même forme que le Daily (`DailyChallenge` / `DailySession`) :
- `RunChallenge.Create(rules, tracks, seed, code, createdBy, now)` : immuable une fois créé.
- `RunSession.Start(challengeId, playerId, now)`, pour l'auteur comme pour un ami : aucun morceau copié. Reçoit les morceaux et les règles du défi pour décider, comme `DailySession` reçoit le défi du jour.
- **Morceau en cours = le premier sans réponse** (verrou, piège 35) ; `TurnOf(position, count)` comme le Daily.
- `RoundOfCurrentTrack()` / `KeepRound(TrackRound)` : la manche Gameplay reconstituée depuis `current_listened_seconds`.
- `Answer(RoundOutcome, points, now)` : note, libère le verrou ; à la fin d'une manche, compare le score de la manche (points arrondis, `>=`) à l'objectif **figé dans `RunRules`** → manche suivante, défaite ou victoire. Fin sur le nombre **réel** de morceaux du défi (piège 38).
- `Abandon(now)`.
- Statuts : `Pending`, `Won`, `Lost`, `Abandoned`.

`RunRules` est un objet valeur rangé en `jsonb` dans le défi : changer un réglage à chaud ne modifie jamais un défi créé.

### 3.2 Politiques (une responsabilité chacune, remplaçables)
- `IRunTrackSelector` → `RankBandSelector` : **tous** les morceaux jouables du catalogue (Daily compris), triés par rang Deezer décroissant et coupés en autant de **tranches** que de manches ; la manche *k* tire ses morceaux dans la tranche *k* avec `ISeededShuffle`. Sans rang : tranche la moins connue. Les 20 morceaux sont tirés au départ.
- Multiplicateur : fixé au tirage selon la manche (×1,0 → ×2,0, interpolation linéaire), enregistré sur le morceau du défi.
- `IRunScoringPolicy` → `ArtistTitleScoring` : (50 si artiste + 50 si titre) × multiplicateur, arrondi au plus proche (`MidpointRounding.AwayFromZero`) sur le total du morceau. Les bonus du proto 2 viendront **décorer** cette politique.
- `DiscLadder` : la liste des disques est une liste de **clés** (`runs.discs.scratched`, `…gold`…), traduites par le front ; au-delà, le dernier disque + étoiles.

Pas d'`IBonus` au proto 1 : un contrat naît d'un besoin réel.

### 3.3 Accès
Runs possède ses autorisations (`runs.access`), **Players n'est pas modifié**. `IRunAccess.CanPlayAsync(playerId)` : admin (`ICurrentPlayer.IsAdmin`) ou ligne dans `runs.access`. Relever un défi existant ne demande pas d'accès : il suffit d'avoir le lien.

### 3.4 Routes (calquées sur celles du Daily)
| Route | Rôle |
|---|---|
| `GET /api/runs/me` | anonyme permis : `hasAccess`, record, partie en cours ; sans identité, `hasAccess: false` sans rien créer |
| `POST /api/runs/challenges` | lance un run : crée le défi et la partie de son auteur, rend la partie (accès requis ; verrou par joueur) |
| `GET /api/runs/challenges/{code}` | ce que montre un lien (écran « lien reçu ») : pseudo de l'auteur, état de sa propre partie sur ce défi (pas commencée, en cours, finie). **Aucun morceau** (piège 31) |
| `POST /api/runs/challenges/{code}/sessions` | relève le défi, ou reprend sa partie en cours dessus (comme `POST /api/daily/sessions`) |
| `GET /api/runs/sessions/{id}` | l'état d'une partie (reprise, fin de manche, écran de fin) |
| `PATCH /api/runs/sessions/{id}/listening` | note l'écoute du morceau en cours |
| `POST /api/runs/sessions/{id}/preview` | l'adresse de l'extrait **du morceau en cours seulement** (jamais d'un morceau futur) |
| `POST /api/runs/sessions/{id}/answers` | répond au morceau en cours (ou le passe) ; révèle le morceau et les points ; une transaction (réponse, manche, fin, record) |
| `POST /api/runs/sessions/{id}/abandon` | abandon |
| `GET /api/runs/challenges/{code}/comparison` | les parties terminées du défi, après la fin de sa propre partie |
| `GET /api/admin/runs/access` | la liste des comptes autorisés (interrupteurs de l'onglet Joueurs en un appel) |
| `PUT` / `DELETE /api/admin/runs/access/{playerId}` | l'interrupteur (policy Admin automatique sur `/api/admin*`) |

- La partie d'un autre joueur répond comme une partie inconnue (`runs.session_not_found`).
- L'adresse de l'extrait du premier morceau arrive avec la réponse de démarrage ou de reprise, celle du suivant avec la réponse à `answers` : le clic « Morceau suivant » lance `play()` sans aller-retour, dans le geste du joueur (iPhone, pièges 44 et 46). `POST …/preview` redemande une adresse fraîche (elles expirent).
- Limites de débit (`RateLimitPolicies`) : lancement d'un run par joueur, lecture d'un lien par IP (`common.too_many_requests`).
- Document OpenAPI `runs` : préfixes `api/runs` et `api/admin/runs`, client NSwag `runs/api.generated.ts`.

### 3.5 Ce que les réponses doivent porter (dicté par les écrans)
- **État d'une partie** (démarrage, reprise, `GET /api/runs/sessions/{id}`) : manche en cours et nombre de manches, position dans la manche, score total, score et objectif de la manche, résultat de chaque morceau déjà joué de la manche (trouvé, à moitié, raté, neutralisé) pour les pastilles, adresse de l'extrait du morceau en cours. Rien sur les morceaux à venir.
- **Réponse à `answers`** (écran de réponse) : artiste, titre, hash de pochette et lien Deezer du morceau, artiste juste, titre juste, points du morceau, nouveau score de la manche et score total ; si le morceau a été neutralisé, rien sur le morceau mais l'objectif de la manche avant et après (l'écran barre l'ancien) ; si la manche se termine, son bilan (débloquée ou non, les 5 morceaux révélés avec leurs points) ; si le run se termine, le résultat de fin ; sinon l'adresse de l'extrait du morceau suivant.
- **Résultat de fin** (écran de fin) : disque (clé), score final, nombre de morceaux trouvés sur le total, résultat de chaque morceau (les 20 carrés), score et objectif de chaque manche (`null` pour une manche non jouée), record (« nouveau record » ou valeur du record), code du défi pour le partage.
- **Lien reçu** (`GET /api/runs/challenges/{code}`) : pseudo de l'auteur (« Invité » à défaut) et état de sa propre partie, de quoi choisir entre l'écran du lien, la reprise et la comparaison ; ni nombre de joueurs ni morceau.
- **Comparaison** : pseudo de l'auteur, nombre de joueurs, une ligne par partie terminée (pseudo ou « Invité », disque, score de chaque manche ou `null`, total, `isMe`), triée par total.

### 3.6 Codes d'erreur
Même façon de faire que le reste du projet : `module.raison` en snake_case, une classe de constantes (`RunsErrorCodes`, comme `DailyErrorCodes`), un `ProblemDetails` avec `code` et `traceId`, **le même nom qu'au Daily pour la même situation**, jamais de renommage une fois publié. Chaque code a sa clé dans `ERROR_MESSAGE_KEYS` (front).

| Code | HTTP | Quand | Équivalent Daily |
|---|---|---|---|
| `runs.access_denied` | 403 | lancer un run sans accès (invité, compte non autorisé) | — |
| `runs.no_challenge` | 503 | le pool jouable n'a pas assez de morceaux pour un défi | `daily.no_challenge` |
| `runs.challenge_not_found` | 404 | code de lien inconnu | — |
| `runs.session_not_found` | 404 | partie inconnue ou d'un autre joueur | `daily.session_not_found` |
| `runs.already_played` | 409 | ce joueur a déjà fini ce défi, ou agit sur une partie finie | `daily.already_played` |
| `runs.abandoned` | 409 | partie abandonnée | `daily.abandoned` |
| `runs.track_not_found` | 404 | position qui n'existe pas dans le défi | `daily.track_not_found` |
| `runs.track_lock_not_released` | 409 | un autre morceau que le morceau en cours (piège 35) | `daily.track_lock_not_released` |
| `runs.already_answered` | 409 | morceau déjà répondu | `daily.already_answered` |
| `runs.comparison_locked` | 409 | comparaison demandée avant la fin de sa propre partie | (cf. `daily.hint_locked`) |

Génériques existants : `common.unauthorized` (401), `common.bad_request` (400), `common.not_found` (404 des routes admin, joueur inconnu ou invité), `common.too_many_requests` (429), `common.unexpected` (500).

### 3.7 Réglages `Runs:` (relus à chaud, `RunsOptions` + `Effective…`)
`Rounds` (4), `TracksPerRound` (5), `ListenSeconds` (10), `ThresholdPercents` ([40,50,60,70]), `MinMultiplier`/`MaxMultiplier` (1,0 / 2,0, moins de 10), `Discs` (liste de clés). Pas de temps de réponse. Contrôlés **au démarrage** (refus, comme `DailyOptionsStartupCheck`) **et à l'usage** : un réglage incohérent changé à chaud est journalisé une fois et le lancement d'un run retombe sur les valeurs par défaut (comme `DailyRules`).

## 4. Données : schéma `runs`

Même forme et même vocabulaire que le Daily : **un défi** = une suite de morceaux, **une partie** = un joueur sur un défi, **une réponse** = une partie sur un morceau.

| Table | Colonnes | Remarques |
|---|---|---|
| `challenges` | `id int identity PK`, `code char(6) UNIQUE` (le lien), `seed int`, `rules jsonb` (règles figées), `created_by uuid null FK players.players ON DELETE SET NULL`, `created_at` | le défi survit à la suppression de son auteur |
| `challenge_tracks` | PK `(challenge_id, position)`, `track_id int FK catalogue.tracks`, `round smallint`, `multiplier numeric(3,2)` | les 20 morceaux, tirés à la création |
| `sessions` | `id int identity PK`, `challenge_id FK`, `player_id uuid FK players.players`, `status smallint`, `current_position smallint null`, `current_listened_seconds numeric(4,2) null`, `rounds_passed smallint`, `total_score int`, `started_at`, `ended_at null` | **unique `(challenge_id, player_id)`** : un défi se joue une fois par joueur ; index `(player_id, status)` |
| `answers` | PK `(session_id, position)`, `artist_correct bool`, `title_correct bool`, `points int`, `neutralized bool`, `answered_at` | jamais le texte saisi (RGPD) |
| `records` | PK `player_id`, `best_score`, `best_rounds_passed`, `session_id`, `achieved_at` | mis à jour dans la transaction de fin |
| `access` | PK `player_id FK players.players`, `granted_at` | l'interrupteur de l'admin |

- **Code du lien** : 6 caractères tirés par `RandomNumberGenerator` dans `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, en majuscules, saisie insensible à la casse ; existence vérifiée avant l'insertion (pas de réessai dans la transaction Wolverine).
- « Lancer un run » = créer un défi **et** la partie de son auteur dans la même transaction ; « relever un défi » = créer une partie sur un défi existant.
- Supprimer un compte efface ses parties et ses réponses ; ses défis restent jouables (`created_by` à `null`).
- Snake_case, schéma déclaré, rien dans `public`, clés étrangères **par le nom du type**, sans navigation EF entre modules (`PersistenceTests`).
- Supprimer ou actualiser un morceau qui a servi dans un défi de run est refusé en 409 `catalogue.track_in_use`, grâce à l'usage déclaré par Runs (§ 6).
- **Morceau sans extrait** : quand Deezer confirme que le morceau en cours n'a plus d'extrait, c'est **le serveur** qui enregistre la réponse comme neutralisée (jamais le client : sinon on « neutraliserait » un morceau difficile) et passe au suivant. Seule une absence définitive neutralise ; une panne ou un quota Deezer (`Unavailable`) laisse le morceau en cours : `ITrackPreviews` doit distinguer les deux cas, ce qu'il ne fait pas aujourd'hui.
- Migration EF classique, sans reprise de données.

## 5. Front : le domaine `runs/`

### 5.1 Organisation
```
runs/
├── domain/       run.ts (jauge, objectif, manche, pastilles, disque : TypeScript pur, testé seul)
├── data-access/  runs.api.ts (client NSwag runs/api.generated.ts), runs-game.store.ts (SignalStore + withTrackRound)
├── feature/      runs.page (partie), run-link.page (lien d'un ami), runs.routes.ts, provide-runs.ts, home-entry (carte de l'accueil)
└── ui/           run-header, objective-gauge, round-pills, answer-card, round-summary, disc-card, round-scores, share-challenge, comparison-table
```
- Routes **`/runs`** et **`/runs/:code`** : des adresses neutres, qui ne cassent pas les liens partagés si le nom change. `/runs/*` exclu de `robots.txt` et du `sitemap.xml`.
- Sheriff : `runs` voit `gameplay` et `account` (pour créer l'invité d'un ami), jamais `daily`.
- Repris du Daily : confirmation avant de quitter une partie (`canDeactivate`), moment sûr de rechargement après une nouvelle version (`ReloadMoment`, une étape de réponse en est un), synchronisation entre onglets, remontée des erreurs.
- Traductions `runs.*` FR/EN (disques compris), mobile first, saisie à 16 px, modales par `ModalService`, boutons par `appButton`.

### 5.2 Les étapes d'une partie
`link` (lien reçu, [`ecrans.md`](ecrans.md#7-le-lien-reçu) § 7) ou `welcome` (premier morceau : le clic lance le son) → par morceau : `playing` / `answering` (lecteur et saisie de `gameplay`) → `revealed` (carte de réponse à la place du lecteur et de la saisie, « Morceau suivant »), ou `neutralized` (carte « Morceau retiré de la manche », [`ecrans.md`](ecrans.md#2b-le-morceau-sans-extrait) § 2b, même bouton) → après le 5e morceau : `round-summary` (fin de manche) → manche suivante, ou `finished` (écran de fin). Reprise : la partie revient à l'étape de son état serveur. La phase `revealed` de `withTrackRound` existe déjà ; c'est l'écran qui change par rapport au Daily.

### 5.3 Composants du Daily à rendre communs
Un mode n'importe jamais l'autre : ce que les maquettes reprennent du Daily et qui vit aujourd'hui dans `daily/ui` **descend dans `gameplay/ui`** (le Daily l'importe de là, sans changement visible), dans la PR du front (P4) :
- la ligne de `track-results-list` (pochette, ✓/✗ Artiste et Titre, « Artiste - Titre », points, lien Deezer), avec le clic vers le graphique et la ligne de statistiques en option ;
- le badge « Écouter sur Deezer » (`deezer-badge`) ;
- le style du lien « Abandonner » de `daily-progress` (un bouton discret, repris tel quel s'il ne vaut pas un composant) ;
- l'écran de reprise (`resume-screen`) et l'écran d'état (`status-screen`, erreur et pas de défi), avec leurs textes passés en entrée : le Daily garde les siens (série), Runs donne les siens ([`ecrans.md`](ecrans.md#écrans-du-daily-repris-tels-quels-sans-maquette)).

Les confirmations d'abandon et de sortie (`ModalService.confirm`, `leave-game.guard`) sont déjà communes : Runs les appelle avec ses propres textes.

### 5.4 Entrée sur l'accueil
- La carte appartient au domaine `runs` ; la page du Daily n'importe pas `runs`. Elle expose un emplacement que remplit un jeton multiple de `core` (`HOME_MODE_ENTRIES`), fourni par `provideRuns()`. Le domaine `home` réservé dans Sheriff est retiré tant que `/` reste le Daily.
- Visible seulement si le joueur a un compte **et** l'accès : `GET /api/runs/me` (appelé pour un compte connecté seulement) renvoie `hasAccess`. Invité ou non autorisé : rien affiché, aucune erreur. Jamais pendant une manche.
- Le « booléen » d'accès = la ligne de `runs.access`, sans mettre une notion de mode dans `players.accounts`.

### 5.5 Admin
L'interrupteur « Platines » de l'onglet Joueurs lit `GET /api/admin/runs/access` une fois et appelle `PUT`/`DELETE`.

## 6. Ce qui touche l'existant : Players et Catalogue ne doivent plus connaître que Daily

**Players (effacement et export).** *Fait en P1 :* Players appelait directement `Daily.Contracts.IPlayerGameData`.
- `Players.Contracts.IPlayerDataContributor` (`Module`, `ExportAsync`, `DeleteAsync`) : Players reçoit `IEnumerable<IPlayerDataContributor>` et les appelle tous dans sa transaction. Daily l'implémente en P1, Runs en P2.
- L'export change de forme : une section par mode (`daily` : série et parties ; `runs` : parties, défis créés, accès) au lieu des champs `streak` / `games` à la racine. Le profil télécharge le fichier tel quel ; `--export-player` suit.
- `IStreakGrants` reste propre à Daily (seul Daily a des gels) : exception nommée dans le test d'architecture.

**Catalogue (usage des morceaux).** *Fait en P1 :* `ITrackUsage` était fourni une seule fois, par Daily (`services.Replace`), et ne compte que les défis du jour : un morceau joué seulement en run serait supprimable (erreur 500 par la clé étrangère) ou remplaçable par une autre chanson.
- Chaque mode **ajoute** son implémentation (`IEnumerable<ITrackUsage>`, plus de `Replace`) ; Catalogue les agrège : un morceau est « utilisé » si un seul mode le dit. Le cooldown, la date de dernier usage et « dans le défi du jour » restent ceux du Daily (Runs répond « aucun »), seul `IsUsed` combine les deux.

**Rang Deezer.** `TrackInfo` (contrat Catalogue) expose `DeezerRank`.

**Pool admin (P1b).** Le pool est commun à tous les modes, l'onglet ne montre que le catalogue : compteur neutre, `isUsed` (calculé par le back, jamais déduit côté front d'un compteur propre à un mode), pastilles par mode ayant joué le morceau. Un sélecteur horizontal défilant (Pool · Daily · Run) donne la vue de chaque mode, en lecture, lue dans `usages[]` de la même réponse ; un mode se déclare dans l'admin par une entrée de registre, donc ajouter Runs ne change pas le Pool. `ITrackUsage` porte le nom de son mode, Catalogue garde le détail par mode en plus de l'agrégat.

**Contrôle nocturne.** `catalogue-refresh` contrôle tout le pool jouable, plus seulement les morceaux hors cooldown : un run tire n'importe quel morceau. Environ 800 morceaux en lots de 10 toutes les 1,5 s, soit 2 min, dans le quota Deezer (piège 16).

**Tests d'architecture.** Les règles écrites pour « Daily » (`UnNoyau_NeVoitDUnModeQueSesContracts`, `CatalogueEtGameplay_NeConnaissentPasDaily`, la liste interdite de Gameplay) deviennent « un mode » (Daily et Runs) ; plus `DailyEtRuns_NeSeVoientPas`.

## 7. SOLID, point par point
- **S** : `RunSession` garde la partie ; tirage, points, seuils, disques sont chacun une classe ; les endpoints ne font qu'enchaîner (LoadAsync / Validate / Post).
- **O** : bonus (proto 2) = décorateurs de `IRunScoringPolicy` et modificateurs de `RunRules` ; nouvelle difficulté = nouvelle implémentation de `IRunTrackSelector` ; nouveau mode = nouveau contributeur RGPD et nouvel usage de morceaux, sans toucher Players ni Catalogue.
- **L** : `HintPolicy.None` et une écoute fixe utilisent `TrackRound` sans cas particulier.
- **I** : Runs ne reçoit que des contrats étroits, jamais une entité d'un autre module.
- **D** : le domaine ne voit que ses ports (`IRunsStore`, `IRunTrackSelector`, `TimeProvider`) ; EF et Wolverine restent dans `Persistence/` et `Application/`.

## 8. Tests
- Unitaires back : `RunSession` (verrou, jauge, fin sur le nombre réel de morceaux, arrondis, neutralisation), `RankBandSelector` (tranches, pool trop petit), `ArtistTitleScoring`, `DiscLadder`, génération du code.
- Intégration (Testcontainers, base neuve par classe) : parcours gagné, perdu, abandonné ; défi d'ami une seule fois ; accès refusé ; partie d'un autre → 404 ; aucun morceau ni extrait d'un morceau futur avant réponse (piège 31) ; réglage changé en cours de partie sans effet ; réglage incohérent à chaud ; double démarrage simultané ; suppression du compte de l'auteur ; export contenant les parties Runs ; suppression et actualisation d'un morceau joué seulement en run → 409 ; `GET /api/runs/me` sans identité ; limites de débit ; comparaison à plusieurs joueurs, verrouillée avant la fin.
- Architecture : règles du § 6.
- Front (Vitest) : domaine `run.ts`, store, chaque écran des maquettes (lien reçu, manche, réponse, morceau sans extrait, fin de manche, fin de run victoire et défaite, comparaison), carte de l'accueil visible ou non, composants descendus dans `gameplay/ui` (le Daily inchangé).
- E2E Playwright : partie gagnée, partie perdue, carte de l'accueil absente sans accès (P4) ; lien d'un ami dans deux navigateurs et comparaison (P5).
- Observabilité : `RunsMetrics` (parties, réponses, disques), logs sans texte saisi ; tableau Grafana « Activité » complété.

## 9. Décisions
1. `TrackInfo.DeezerRank` dans le contrat de Catalogue : validé (Clément, 17/10).
2. Inversion RGPD (`IPlayerDataContributor`) dès la première PR : validé.
3. Lien par code court `inseconds.cc/runs/K7Q2M9` : validé (un lien neutre `/d/…` est gardé pour un mode futur qui partagerait aussi des liens).
4. Tirage par tranches de rang Deezer : validé.
5. Genre de l'album stocké dès maintenant (P0, PR à part dans Catalogue) : **en attente de Clément**.
6. Usage des morceaux déclaré par chaque mode : proposé après la revue, repris dans P1.
7. Morceau sans extrait au moment de jouer : neutralisé (Clément, 17/10).
8. Temps de réponse : aucun chrono, partie à l'honneur, réécoute libre (Clément, 17/10). Un chrono `Runs:AnswerSeconds` ne sera ajouté que si les parties de test montrent des abus ; limiter les réécoutes reste un bonus ou un malus possible du proto 2.
9. Entrée sur l'accueil : la carte seulement (option A), rien d'autre ne change sur l'accueil ni sur « déjà joué » (Clément, 17/10).
10. Les maquettes de [`ecrans.md`](ecrans.md) font référence, dont la réponse après chaque morceau dans l'écran de manche (Clément, 17/10).
11. À l'écran, le défi s'appelle une **playlist** partout (titres, boutons, comparaison) ; le code et cette conception gardent `challenge` / « défi » (Clément, 18/10).
12. Question ouverte : remettre ou non une ligne « X % ont échoué » sous chaque morceau de la fin de manche (elle demanderait des statistiques par morceau sur les runs, absentes du proto 1).
