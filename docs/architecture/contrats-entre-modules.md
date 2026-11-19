# Les contrats entre modules (`Contracts/`)

Règle résumée dans le [`CLAUDE.md`](../../CLAUDE.md#règles-dures-vérifiées-en-ci).

## 1. L'idée en une phrase

Chaque module (Players, Catalogue, Gameplay, Daily, Runs, Social) a une partie privée et une partie publique. La partie publique, c'est son dossier `Contracts/`. Un autre module n'a le droit d'utiliser **que** ce dossier, jamais le reste.

```
Modules/Players/
├── Domain/        privé : Player, DeviceSession, règles métier
├── Application/   privé : les endpoints Wolverine et leurs handlers
├── Persistence/   privé : EF, tables du schéma players, IPlayerStore
├── Email/         privé : gabarits des mails
├── Contracts/     PUBLIC : ce que les autres modules peuvent appeler
└── PlayersModule.cs   privé : AddPlayers / MapPlayers (branché par la composition de l'API)
```

C'est le principe d'une « API interne » : `Contracts/` est la vitrine, le reste est la cuisine.

Trois modules sont des **noyaux** : Players (le joueur), Catalogue (les morceaux) et Social (les groupes entre amis et le classement). Deux sont des **modes de jeu** : Daily (le défi du jour) et Runs (la Survie). Gameplay porte la mécanique d'une manche, partagée par les modes, sans table ni route. Un noyau ne connaît aucun mode : quand il a besoin de ce qu'un mode sait, il déclare un contrat dans ses propres `Contracts/` et le mode l'implémente.

## 2. Ce qu'on met dans `Contracts/`

Trois sortes de choses, et rien d'autre :

1. **Des interfaces** (des « ports ») : ce qu'un module sait faire pour les autres. Exemple : « donne-moi le joueur courant », « accorde un gel ».
2. **Des DTO et des règles pures** : les données qui traversent la frontière (des `record` simples, sans comportement, jamais une entité EF), et quelques règles sans état partagées (`PseudoRules`).
3. **Des événements** Wolverine, quand un léger décalage est sans effet. Aucun n'existe aujourd'hui : tous les besoins croisés actuels veulent leur réponse dans la même transaction.

L'implémentation de l'interface reste dans la partie privée du module (souvent `Persistence/`), et l'injection de dépendances fait le lien.

## 3. Les contrats du code

| Contrat | Module propriétaire | Implémenté par | Utilisé par |
|---|---|---|---|
| `ICurrentPlayer` | Players | `ClaimsCurrentPlayer` (`Players/Auth`, claims du cookie) | Players, Daily, Runs, Social |
| `IPlayerSessions` | Players | `EfPlayerSessions` | l'authentification par cookie (`Players/Auth`) |
| `IPlayerDirectory` | Players | `EfPlayerDirectory` | Daily, Runs, Social (pseudos affichés ; Social vérifie aussi qu'un alias n'est pas le pseudo d'un compte) |
| `IReservedPseudos` | Players | `SocialReservedPseudos` **dans Social** | Players (un compte ne prend pas pour pseudo l'alias d'un autre : `AccountSignIn`, profil) |
| `PseudoRules` | Players | règle pure (caractères permis) | Players (pseudos), Social (noms de groupe) |
| `IPlayerDataContributor` | Players | `DailyPlayerData`, `RunsPlayerData`, `SocialPlayerData`, enregistrés en un seul endroit (`ApiComposition.AddPlayerDataContributors`, partagé par l'API et les commandes de secours) | Players (`PlayerDataExporter`, `AccountErasure` : export et effacement d'un compte), commandes `--export-player` / `--delete-player` |
| `ITrackDirectory` | Catalogue | `EfTrackDirectory` | Daily, Runs, commande `--export-player` |
| `ITrackPreviews` | Catalogue | `DeezerTrackPreviews` | Daily, Runs (adresse de l'extrait) |
| `ITrackWaveforms` | Catalogue | `EfTrackWaveforms`, enveloppé par `LoggedTrackWaveforms` | Daily, Runs (forme d'onde envoyée avec le morceau) |
| `ITrackUsage` | Catalogue | `EfTrackUsage` **dans Daily**, `RunsTrackUsage` **dans Runs**, chacun **ajouté** au conteneur | Catalogue, par `ITrackPoolUsage` |
| `ITrackPoolUsage` | Catalogue | `TrackPoolUsage` (réunit l'`ITrackUsage` de chaque mode) | Catalogue (pool de l'admin, suppression, désactivation et actualisation depuis Deezer d'un morceau déjà utilisé) |
| `TrackRound`, `RoundOutcome`, ports d'indice et de correction | Gameplay | Gameplay | Daily, Runs |
| `IStreakGrants` | Daily | `DailyStreakGrants` | Players, à la création d'un compte (`AccountSignIn`) |
| `IMemberPerformanceSource` | Social | `RunsMemberPerformance` **dans Runs** | Social (le classement d'un groupe et le classement général) |
| `IMemberScoreSource` | Social | `DailyMemberScores` **dans Daily** | Social (le classement d'un groupe par score, jour et semaine, un par mode) |

`TrackTitles` (le titre montré au joueur, sans parenthèses ni crochets) est aussi dans `Catalogue/Contracts` ; il n'est lu aujourd'hui que par Catalogue, qui remplit `TrackInfo.DisplayTitle` avec.

Exemple : `IPlayerSessions.GetStatusAsync` renvoie un `DeviceSessionStatus(IsActive, IsAdmin, LastSeenAt)`. L'authentification n'a pas besoin de savoir qu'il existe une table `players.device_sessions`, une colonne `revoked_at` ou une suppression du joueur : elle reçoit juste « actif ou pas ». Si Players change ses tables, l'authentification ne bouge pas.

`ITrackUsage` montre l'inversion : Catalogue a besoin de savoir si un morceau a déjà servi, mais l'usage se calcule sur les tables des modes (`daily.challenge_tracks`, les parties de Runs). Catalogue déclare le port dans ses propres `Contracts`, chaque mode l'implémente, et `ITrackPoolUsage` les réunit : Catalogue ne connaît aucun mode. Un consommateur n'injecte jamais `ITrackUsage` seul (il recevrait celui du dernier mode enregistré). `IPlayerDataContributor`, `IReservedPseudos` et `IMemberPerformanceSource` suivent le même schéma.

## 4. Comment la règle est vérifiée

C'est un test qui casse la CI, pas une convention. Les tests sont dans `src/back/tests/InSeconds.ArchitectureTests/` (NetArchTest) :

- `ModuleDependencyTests.cs` : un module n'utilise des autres que leur dossier `Contracts` (les modules sont découverts sous `InSeconds.Api.Modules`, un nouveau module est contrôlé dès qu'il existe), et les règles de voisinage entre noyaux, modes et Gameplay ;
- `HandlerRulesTests.cs` : les règles des handlers, et qu'un noyau ne voit d'un mode que les exceptions nommées (`ModuleRules.NamedExceptions`) ;
- `ModuleRules.cs` : la liste des noyaux, des modes et des exceptions nommées.

Les autres fichiers du dossier (`PersistenceTests`, `ClockUsageTests`, `InfrastructureDependencyTests`, `ProjectDependencyTests`) tiennent les autres règles dures.

Côté front, Sheriff (`sheriff.config.ts`) tient le même principe : `gameplay` et `social` ne connaissent aucun mode, `daily` et `runs` ne s'importent jamais ; `daily` importe `gameplay` et `account`, `runs` importe `gameplay`, `account` et `social` (les groupes du joueur à la fin d'une partie).

## 5. Runs et Social

Partager un noyau ne veut pas dire lire ses tables. Runs utilise Players et Catalogue **par leurs contrats**, comme Daily. Runs n'a pas de dossier `Contracts/` : il n'expose rien, il implémente les contrats des noyaux.

```
            Daily ───────✕─────── Runs          (un mode ne voit jamais l'autre)
              │  \               /  │
              │   └──► Gameplay ◄┘  │
              │           │         │
              ▼           ▼         ▼
     Players/Contracts   Catalogue/Contracts   Social/Contracts
              ▲                                  ▲      │
              └──────────────── Social ──────────┘      │
                                            Runs implémente IMemberPerformanceSource
                                            Daily implémente IMemberScoreSource
```

- **Le joueur** : `ICurrentPlayer` pour savoir qui joue, `IPlayerDirectory` pour afficher un pseudo, sans jamais voir l'email, les appareils ni le rôle admin.
- **Les morceaux** : `ITrackDirectory` (rang Deezer, année, état de l'extrait, genres de l'album, thèmes), `ITrackPreviews`, `ITrackWaveforms`.
- **L'effacement d'un compte** : Players expose `IPlayerDataContributor`, Daily, Runs et Social l'implémentent, `AccountErasure` et `PlayerDataExporter` les appellent tous dans la même transaction.
- **Le classement** : Social ne connaît aucun mode ; la performance de chaque membre arrive par `IMemberPerformanceSource`, que Runs implémente, et ses scores du jour et de la semaine par `IMemberScoreSource`, que Daily implémente (un classement par mode, jamais une moyenne des modes). Daily et Runs ne voient de Social que ces contrats.

Si Runs lisait directement les entités de Players ou de Catalogue, une évolution faite pour Runs dans ces noyaux pourrait casser Daily, et inversement.

## 6. Ce qu'on perdrait sans `Contracts/`

- **Aucune frontière vérifiable.** Tout le monde pourrait injecter `IPlayerStore`, charger un `Player` et le modifier, comme un `DbContext` injecté partout.
- **Des modules soudés.** Renommer une colonne de Players obligerait à corriger Daily et Runs ; l'indépendance des modes ne tiendrait qu'à la discipline.
- **Des invariants contournables.** Piège 30 : un compte connecté a déjà été converti par erreur parce que n'importe quel code touchait `Player`. Seul Players modifie un `Player`, par ses méthodes métier ; les autres demandent par contrat.

## 7. Garder les contrats légers

- **Pas de `Contracts/` par principe** : un module qui n'expose rien n'en a pas (Runs).
- **Un contrat naît d'un besoin réel**, pas « au cas où ».
- **Des DTO étroits** : `PlayerSummary(Id, Pseudo)`, pas l'entité entière.
- **Synchrone ou événement ?** Interface quand l'appelant a besoin de la réponse tout de suite ou dans la même transaction (le gel doit être visible au récap, d'où `IStreakGrants`). Événement Wolverine par l'outbox quand un léger décalage est sans effet.
- **Clés étrangères entre schémas** : déclarées par le nom du type, sans navigation EF. La base garde son intégrité sans que le code traverse la frontière.

## 8. Point d'attention

`IStreakGrants` reste le seul contrat d'un **mode** vu par un **noyau** (Daily vu par Players) : exception nommée (`ModuleRules.NamedExceptions`), vérifiée par `HandlerRulesTests.cs`. Le gel offert à la création d'un compte n'a pas encore de forme inversée.
