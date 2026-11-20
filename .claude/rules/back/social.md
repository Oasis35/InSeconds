---
paths:
  - "src/back/InSeconds.Api/Modules/Social/**"
  - "src/back/tests/**/Social/**"
---
# Module Social (groupes entre amis, classements)

Un **noyau**, comme Players et Catalogue : il ne connaît aucun mode (`ModuleRules.Cores`, `Social_NeDependQueDesContratsDesAutresModules_EtDAucunMode`). De Players, il n'utilise que `ICurrentPlayer`, `IPlayerDirectory` et `PseudoRules`. Règles : [`docs/runs/regles.md`](../../../docs/runs/regles.md) (Groupes, Classement général), conception : [`docs/runs/conception.md`](../../../docs/runs/conception.md). Point d'entrée `SocialModule.AddSocial()` (+ `AddSocialPlayerData()`).

## Contrats

- `Contracts/IMemberPerformanceSource` : **défini par Social, implémenté par chaque mode** (`AddScoped<IMemberPerformanceSource, …>`, ajouté, jamais remplacé). `Source` (nom du mode), `GetAsync(joueurs)` (performance de 0 à 1, parties, meilleur score, points et clé de badge, pour ceux qui ont fini une partie), `ListGeneralRankingPlayersAsync` (qui le mode met au classement général). Aujourd'hui seul Runs l'implémente (`RunsMemberPerformance`). Daily et Runs ne voient de Social que ses contrats (`DailyEtRuns_NeVoientDeSocialQueSesContrats`).
- `Contracts/IMemberScoreSource` : le classement **par score** d'un groupe, **un par mode** (jamais une moyenne des modes), même principe d'ajout. `GetAsync(joueur qui regarde, joueurs)` rend le jour de jeu, `TodayRevealed` et, par membre, `PlayedToday`, `TodayScore`, `WeekPoints`, `WeekPlayedDays` (les jours joués, dates des défis ; semaine : `ScorePeriods.WeekDays`, 7 jours glissants). Social reprend ces jours tels quels, comme les points (la source garantit des jours uniques, croissants, dans les 7 jours qui finissent `Day`), et en fait `playedDays` de la réponse (les sept points de l'écran). **Le mode décide de ce que voit le joueur qui regarde**, et **la semaine est entièrement à sa charge** (il en retire tout jour que le joueur qui regarde peut encore jouer : Social ne peut pas le faire) ; Social retire seulement, par prudence, le score du jour si `TodayRevealed` est faux. `GetDayAsync(joueur qui regarde, jour, joueurs)` rend les scores d'un jour passé (ou du jour) et `Revealed`, faux tant que le joueur peut encore jouer ce défi ; Social ne montre alors aucun score. Seul Daily l'implémente (`DailyMemberScores`), et Daily n'implémente pas `IMemberPerformanceSource` ; les deux contrats ne sont implémentés que dans un mode (`SourcesDesClassements_ImplementeesParLesModes_LeDefiDonneDesScoresPasUneMoyenne`).
- Contrat inverse : `Players.Contracts.IReservedPseudos`, défini par Players, implémenté ici (`SocialReservedPseudos`) : Players refuse un pseudo égal à l'alias d'un autre joueur.
- `GroupRanking` et `GroupScores` (services qui énumèrent les sources) sont en service location dans `WolverineSetup`.

## Ports et domaine

- `IGroupStore` (`Domain/Group.cs`, écritures et verrous), `IRankingIdentityStore` (`Domain/GeneralRanking.cs`), `ISocialQueries` (`Application/SocialQueries.cs`).
- `Group` : `Leave` rend `Left`, `OwnerChanged` (le plus ancien membre restant devient créateur) ou `Emptied` (le groupe se supprime) ; code d'invitation de 8 caractères (`GroupInviteCode`, `Normalize` accepte la saisie en minuscules) ; nom selon `PseudoRules`.
- `GroupRankingPolicy` (pure) : performance moyenne bornée, puis points, puis parties jouées, puis pseudo ; les membres sans partie à la fin, sans rang. `GeneralRankingPolicy` la réutilise.
- `ScoreRankingPolicy` (pure, `Domain/ScoreRanking.cs`) : le classement d'une période (jour, semaine), score le plus haut d'abord, ex æquo au même rang rangés par pseudo, membres sans score à la fin sans rang. Service `GroupScores` (`Application/SocialQueries.cs`, à côté de `GroupRanking`), route `GET /api/social/groups/{id}/scores` (`GetGroupScoresEndpoint`, `Application/GroupEndpoints.cs`), membre seulement (404 sinon) ; `GET /api/social/groups/{id}/scores/{date}` (`GetGroupDayScoresEndpoint`, `GroupScores.RankDayAsync`) pour un jour, 400 `social.invalid_date` pour un jour mal écrit ou futur.
- Limites `Social:` relues à chaud ; une valeur hors bornes retombe sur le défaut (`SocialRules`). Une limite abaissée ne chasse personne.

## Concurrence

Toute écriture prend des verrous consultatifs de transaction : **celui du joueur (limite de groupes) puis celui du groupe (limite de membres), toujours dans cet ordre**, avant de charger le groupe avec ses membres (`AdhesionsSimultanees_NeDepassentPasLaPlaceDuGroupe`). La modération de l'admin prend le verrou du groupe avant la lecture. Le tirage d'un alias prend un verrou à part (`LockAliasDrawAsync`) ; l'index unique reste le dernier filet (`AliasConflictExceptionHandler`, 409 `social.alias_taken`).

## Confidentialité

- **Un non-membre reçoit 404, jamais 403** : l'existence d'un groupe ne se devine pas (`NonMembre_404_SurLeDetailEtLeClassement_JamaisUnPseudo`). Seuls les membres voient les pseudos d'un groupe ; l'aperçu d'une invitation n'en montre aucun.
- Un invité n'a jamais de groupe : 403 `social.account_required` pour créer ou rejoindre, liste vide en lecture.
- Classement général (`Application/GeneralRankingEndpoints.cs`) : comptes que les modes y mettent, jamais un invité ni un admin, même avec sa ligne `runs.access` (`GroupRanking.ListGeneralRankingPlayersAsync` retire les comptes de `IPlayerDirectory.ListAdminsAsync` ; `General_UnAdmin_NYFigurePas_MemeAvecLAccesEtUnNiveau`). Rang, nom, disque et points seulement (ni parties, ni record, ni performance : ils aideraient à relier un alias à un pseudo), sous l'alias s'il y en a un, sinon le pseudo. Calcul gardé une minute dans `GeneralRankingCache` (singleton), vidé par un changement d'identité (tout de suite et après le commit) et par l'effacement d'un compte.
- Alias musicaux (`MusicalAlias`) : listes écrites à la main et relues pour qu'aucune combinaison ne blesse ; un alias n'est ni celui d'un autre (sans la casse) ni le pseudo d'un compte (`RankingIdentities.DrawFreeAliasAsync`).
- Codes d'invitation et de playlist hors des traces : `LinkSecrets` (`Infrastructure/Hosting`) remplace le code par `{code}` dans le chemin des spans, le scope `RequestPath` des journaux et les URL des erreurs du front (`Invitation_LeCodeNEntrePasDansLaTrace`). Une nouvelle route qui porte un secret dans son chemin s'y ajoute.
- Journaux (`SocialLog`, 1800 à 1808) : identifiants seulement, **jamais un nom de groupe, un pseudo ni un alias**. Métriques `SocialMetrics` (meter `InSeconds.Social`) sans identifiant.

## Données du joueur (piège 48)

`SocialPlayerData` (section `social`) exporte ses groupes (jamais le pseudo d'un autre ni le code) et son identité au classement, et à l'effacement : un créateur passe la main au plus ancien membre, le dernier membre supprime le groupe, puis adhésions et identité partent (`ExecuteUpdate` / `ExecuteDelete`, la ligne du joueur part juste après). `group_members.player_id`, `groups.owner_id` et `ranking_identity.player_id` désignent un joueur (`Piege48_ToutesLesColonnesPlayerIdDeSocial_SontConnuesDeLEffacement`).

## Administration

`Application/AdminGroups.cs` : lister, renommer, remettre un nom à zéro (« Groupe {id} »), supprimer ; jamais le code d'invitation ni les membres. Routes `api/admin/social`, dans le document OpenAPI de Social.
