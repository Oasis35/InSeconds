# Les contrats entre modules (`Contracts/`)

Écrit le 05/10/2026, mis à jour le 17/10/2026. Règle résumée dans le [`CLAUDE.md`](../../CLAUDE.md#règles-dures-vérifiées-en-ci) ; contexte dans [`historique/refonte-2026/PLAN.md`](../historique/refonte-2026/PLAN.md) § 3.3, § 5.1 et § 5.3.

## 1. L'idée en une phrase

Chaque module (Players, Catalogue, Gameplay, Daily, et plus tard Runs) a une partie privée et une partie publique. La partie publique, c'est son dossier `Contracts/`. Un autre module n'a le droit d'utiliser **que** ce dossier, jamais le reste.

```
Modules/Players/
├── Domain/        privé : Player, DeviceSession, règles métier
├── Application/   privé : les endpoints Wolverine et leurs handlers
├── Persistence/   privé : EF, tables du schéma players, IPlayerStore
├── Email/         privé : gabarits des mails
├── Contracts/     PUBLIC : ce que les autres modules peuvent appeler
└── PlayersModule.cs   privé : AddPlayers / MapPlayers (branché par Program.cs)
```

C'est le principe d'une « API interne » : `Contracts/` est la vitrine, le reste est la cuisine.

## 2. Ce qu'on met dans `Contracts/`

Trois sortes de choses, et rien d'autre :

1. **Des interfaces** (des « ports ») : ce qu'un module sait faire pour les autres. Exemple : « donne-moi le joueur courant », « accorde un gel ».
2. **Des DTO** : les données qui traversent la frontière (des `record` simples, sans comportement, jamais une entité EF).
3. **Des événements** Wolverine, quand un léger décalage est sans effet. Aucun n'existe aujourd'hui : tous les besoins croisés actuels veulent leur réponse dans la même transaction.

L'implémentation de l'interface reste dans la partie privée du module (souvent `Persistence/`), et l'injection de dépendances fait le lien.

## 3. Les contrats du code

| Contrat | Module propriétaire | Implémenté par | Utilisé par |
|---|---|---|---|
| `ICurrentPlayer` | Players | `Infrastructure/Auth` (claims du cookie) | Players, Daily |
| `IPlayerSessions` | Players | `EfPlayerSessions` | l'authentification par cookie (`Infrastructure/Auth`) |
| `IPlayerDirectory` | Players | `EfPlayerDirectory` | Daily (pseudos des stats et de l'admin) |
| `ITrackDirectory`, `TrackTitles` | Catalogue | `EfCatalogueQueries` | Daily (tirage, stats, récap), commande `--export-player` |
| `ITrackPreviews` | Catalogue | `DeezerTrackPreviews` | Daily (adresse de l'extrait au démarrage d'une partie) |
| `ITrackUsage` | Catalogue | `EfTrackUsage` **dans Daily**, puis un par mode ajouté | Catalogue (`ITrackPoolUsage` : agrège tous les modes, suppression d'un morceau jamais utilisé) |
| `TrackRound`, `RoundOutcome`, ports d'indice et de correction | Gameplay | Gameplay | Daily |
| `IStreakGrants` | Daily | `DailyStreakGrants` | Players, à la création d'un compte (`AccountSignIn`) |
| `IPlayerDataContributor` | Players | `DailyPlayerData` **dans Daily**, puis un par mode ajouté, enregistrés en un seul endroit (`ApiComposition.AddPlayerDataContributors`, partagé par l'API et les commandes de secours) | Players (export et effacement d'un compte, section `modules.<mode>`), commandes `--export-player` / `--delete-player` |

Exemple : `IPlayerSessions.GetStatusAsync` renvoie un `DeviceSessionStatus(IsActive, IsAdmin, LastSeenAt)`. L'authentification n'a pas besoin de savoir qu'il existe une table `players.device_sessions`, une colonne `revoked_at` ou une suppression du joueur : elle reçoit juste « actif ou pas ». Si Players change ses tables, l'authentification ne bouge pas.

`ITrackUsage` montre l'inversion possible : Catalogue a besoin de savoir si un morceau a déjà servi, mais l'usage se calcule sur les tables de Daily (`challenge_tracks`). Catalogue déclare le port dans ses propres `Contracts`, Daily l'implémente : Catalogue ne connaît toujours pas Daily.

## 4. Comment la règle est vérifiée

C'est un test qui casse la CI, pas une convention.

`tests/InSeconds.ArchitectureTests/ModuleDependencyTests.cs` (NetArchTest), test `UnModule_NUtiliseDesAutresModulesQueLeurDossierContracts` :

- il découvre tout seul les modules présents sous `InSeconds.Api.Modules` (un nouveau module est contrôlé dès qu'il existe) ;
- pour chaque module, il liste tout ce qui appartient aux **autres** modules hors `Contracts` (y compris les classes posées à leur racine, comme `DailyModule`) ;
- il échoue si un type du module dépend d'un seul de ces éléments, en nommant la classe fautive.

Autres garde-fous du même dossier : `Gameplay_NeDependQueDeCatalogueContracts_EtResteSansAccesAuxDonneesNiAuWeb`, `CatalogueEtGameplay_NeConnaissentPasDaily`, `Daily_NeDependQueDesContratsDeCatalogueEtDeGameplay_EtPasDeDeezer`, `LesModulesDesNoyaux_NeDependentPasDeGameplay`, `UnNoyau_NeVoitDUnModeQueSesContracts` (`HandlerRulesTests`), `LeDomaine_NeDependNiDEfCoreNiDAspNetCoreNiDeNpgsql`, `PersistenceTests` (rien dans `public`, tout en snake_case). Côté front, Sheriff (`sheriff.config.ts`) tient le même principe : un mode n'importe que `gameplay` et `account`, jamais un autre mode.

## 5. Quand Runs arrivera

Partager un noyau ne veut pas dire lire ses tables. Runs utilisera Players et Catalogue **par leurs contrats**, comme Daily :

```
            Daily ───────✕─────── Runs          (un mode ne voit jamais l'autre)
              │  \               /  │
              │   └──► Gameplay ◄┘  │
              │           │         │
              ▼           ▼         ▼
     Players/Contracts   Catalogue/Contracts
```

- **Le joueur** : `ICurrentPlayer` pour savoir qui joue, `IPlayerDirectory` pour afficher un pseudo, sans jamais voir l'email, les appareils ni le rôle admin.
- **Les morceaux** : `ITrackDirectory`, qui expose rang Deezer, année et état de l'extrait. Le jour où Catalogue ajoute les genres, Runs les reçoit par le contrat ; Daily ne voit rien changer.
- **L'effacement d'un compte** : Players expose `IPlayerDataContributor` dans ses propres `Contracts`, chaque mode l'implémente, `AccountErasure` et `PlayerDataExporter` les appellent tous dans la même transaction.

Si Runs lisait directement les entités de Players ou de Catalogue, une évolution faite pour Runs dans ces noyaux pourrait casser Daily, et inversement.

## 6. Ce qu'on perdrait sans `Contracts/`

- **Aucune frontière vérifiable.** Tout le monde pourrait injecter `IPlayerStore`, charger un `Player` et le modifier, comme un `DbContext` injecté partout.
- **Des modules soudés.** Renommer une colonne de Players obligerait à corriger Daily et Runs ; l'indépendance des modes ne tiendrait qu'à la discipline.
- **Des invariants contournables.** Piège 30 : un compte connecté a déjà été converti par erreur parce que n'importe quel code touchait `Player`. Seul Players modifie un `Player`, par ses méthodes métier ; les autres demandent par contrat.

## 7. Garder les contrats légers

- **Pas de `Contracts/` par principe** : un module qui n'expose rien n'en a pas.
- **Un contrat naît d'un besoin réel**, pas « au cas où ».
- **Des DTO étroits** : `PlayerSummary(Id, Pseudo)`, pas l'entité entière.
- **Synchrone ou événement ?** Interface quand l'appelant a besoin de la réponse tout de suite ou dans la même transaction (le gel doit être visible au récap, d'où `IStreakGrants`). Événement Wolverine par l'outbox quand un léger décalage est sans effet.
- **Clés étrangères entre schémas** : déclarées par le nom du type, sans navigation EF. La base garde son intégrité sans que le code traverse la frontière.

## 8. Points d'attention

`IStreakGrants` reste le seul contrat de **Daily** appelé par **Players** : un noyau qui connaît un mode, exception nommée (`ModuleRules.NamedExceptions`) vérifiée par `UnNoyau_NeVoitAucunMode_SaufLesExceptionsNommees`. Le gel offert à la création d'un compte n'a pas encore de forme inversée.
