---
paths:
  - "src/back/InSeconds.Api/Modules/Runs/**"
  - "src/back/tests/**/Runs/**"
  - "docs/runs/**"
---
# Module Runs (la Série, « Survie » à l'écran)

Le second mode : défis sans fin tirés à la volée, accès sur invitation, partie à vies et paliers d'écoute, thèmes, fantôme, comparaison, niveau, Hits. Règles du jeu : [`docs/runs/regles.md`](../../../docs/runs/regles.md), conception : [`docs/runs/conception.md`](../../../docs/runs/conception.md). Point d'entrée `RunsModule.AddRuns()` (+ `AddRunsPlayerData()`).

## Frontières

- **Runs n'a pas de dossier `Contracts/`** : aucun module ne l'utilise. Il ne voit de Players, Catalogue et Gameplay que leurs `Contracts`, jamais Deezer (`Runs_NeDependQueDesContratsDesAutresModules_EtPasDeDeezer`), ni Daily (`DailyEtRuns_NeSeVoientPas`), et de Social que `IMemberPerformanceSource`.
- Il implémente : `IPlayerDataContributor` (`RunsPlayerData`, section `runs` : parties, défis créés, record, niveau, accès, défis reçus), `ITrackUsage` (`RunsTrackUsage`, mode `runs` : un morceau d'un défi n'est plus supprimable, pas de cooldown propre), `IMemberPerformanceSource` (`RunsMemberPerformance`, source `runs` : le niveau du joueur, son disque, son record).
- Ports : `IRunsStore` (`Domain/RunSession.cs`), `IRunsQueries` et `IRunAccess` (`Application/RunAccess.cs`), `IRunHistoryQueries` (`RunHistory.cs`), `IRunHitsQueries` (`RunHitsEndpoint.cs`). Politiques : `IRunTrackSelector` (`RankBandSelector`), `IRunScoringPolicy`.
- Accès : `IRunAccess.CanPlayAsync` vrai pour un compte qui a une ligne `runs.access`, admin compris (le rôle ne donne rien d'office : un admin se coupe l'accès par son interrupteur ; la migration `AdminRunAccess` a donné leur ligne aux admins d'alors). Lancer **et** rejoindre un défi l'exigent (403 `runs.access_denied`) : le lien d'un ami n'ouvre pas le mode.

## Défi et règles figées

- `RunChallenge` : code de 6 caractères (le lien, alphabet sans ambiguïté, `RandomNumberGenerator`), graine **jamais exposée**, `RunRules` figées en `jsonb` à la création : un réglage changé ne touche que les défis à venir. `created_by` nullable (un compte effacé n'efface pas le défi).
- **Un champ ajouté à `RunRules` a une valeur par défaut neutre** (faux, 0) : les règles d'une playlist plus ancienne ne le contiennent pas et doivent garder leur comportement (`RunSessionTests`, règles relues du JSON ; `RunGame.LegacyRules` dans les tests d'intégration).
- Réglages `Runs:` : contrôlés au démarrage (`RunsOptionsStartupCheck`) **et à l'usage** (`RunsRules.Current()` : une valeur incohérente écrite à chaud retombe sur les défauts, EventId 1400 une fois par valeur). `Runs:Diversity:` et `Runs:Levels:` sont relus à chaud et jamais figés dans un défi.

## Tirage

- Paresseux : la manche 1 est tirée à la création (`RunChallengePlanner`), chaque suivante par le **premier joueur qui y arrive** (`RunRoundDealer.DealAsync`), sous `IRunsStore.LockChallengeAsync` (verrou consultatif par défi, qui relit l'état du défi) ; une manche tirée est figée pour tous. Le choix du thème d'une manche suit le même verrou.
- `RankBandSelector` : pool jouable trié par rang Deezer décroissant, coupé en `RankBands` tranches, la manche k tire dans la tranche k (la dernière se répète), mélange avec graine et numéro de manche, jamais un morceau déjà tiré.
- Diversité : `RunDrawMemoryReader` est le **seul constructeur** de la mémoire de tirage (`RunDrawMemory`), pour la manche 1 (avec le créateur) comme pour les suivantes (avec le joueur qui tire). La mémoire se lit dans ses parties passées (`IRunsQueries.GetHeardHistoryAsync`) : rien n'est stocké, rien à ajouter à l'effacement.
- Thèmes : offerts à partir de la manche 2 quand assez de thèmes ont des morceaux libres (`RunThemes`), tirés avec graine et manche (stables au rechargement) ; le thème mystère est noté dans les règles figées (`RunRoundTheme.Mystery`).

## Partie

- `RunSessionStatus` : 0 `Pending`, 1 `Completed` (Série complète), 2 `Lost`, 3 `Abandoned`. Une partie finie (`IsFinished`) est perdue ou complète : elle compte pour le record, le niveau, l'historique, les Hits et la comparaison ; un abandon ne compte pas.
- Le morceau en cours est le premier sans réponse (piège 35). Le palier d'une manche **se calcule** depuis les réponses (`StepOf`, `TallyOf`, `RunSteps.Next`), jamais stocké ; les vies aussi (`LivesLeft`).
- Morceau sans extrait **neutralisé par le serveur** (`RunPlayer.AdvanceAsync`), jamais à la demande du client : `Missing` neutralise (0 point, ni vie ni palier touchés), `Unavailable` laisse le morceau en cours et le joueur réessaie (piège 16).
- Chrono : part au premier son annoncé par le client (borné), une réponse trop tardive compte comme un morceau passé ; la reprise rend le temps restant.
- **Ordre des verrous consultatifs** : défi (`LockChallengeAsync`, au tirage d'une manche) puis joueur (`LockRecordAsync`, à la fin : record et niveau dans la transaction de fin). Ne jamais prendre l'inverse. `LockPlayerStartAsync` et `LockReceivedAsync` protègent le démarrage et le défi reçu.
- Rien qui identifie un morceau avant la réponse (piège 31) : seul l'extrait du morceau en cours part ; la comparaison des joueurs ne rend que des scores et reste fermée tant qu'on n'a pas fini sa propre partie (409 `runs.comparison_locked`).
- Les réponses ne gardent jamais le texte saisi.

## Niveau, fantôme, Hits

- Niveau (`RunLevel`, `RunLevelPolicy`, `runs.player_levels`) : mis à jour dans la transaction de fin, jamais par un abandon ; l'inactivité est **calculée à la lecture**, aucune tâche de nuit. Le fantôme n'y est pour rien.
- Fantôme (`RunGhosts`) : l'auteur de la playlist, quand il l'a finie ; son total sur les morceaux joués.
- Hits (`RunHits`) : calculés à la lecture sur les parties finies, rien de stocké (le Hit « premier groupe » vient du front).

## Journaux et métriques

- `RunsLog` : 1400 à 1411, 1415, 1416 (1412 à 1414 absents, ne pas les reprendre) ; jamais le texte saisi.
- `RunsMetrics` (meter `InSeconds.Runs`, `inseconds.runs.*`) nourrit le tableau Grafana « Activité » ; étiquettes bornées, jamais un identifiant.
