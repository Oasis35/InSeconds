---
paths:
  - "src/back/InSeconds.Api/Modules/Daily/**"
  - "src/back/tests/**/Daily/**"
---
# Module Daily

Le défi du jour : défis et génération, usage des morceaux et cooldown, parties, score, série et gels, statistiques, réponses des jours passés, historique du joueur, admin du jeu. Règles du jeu : [`docs/regles-du-jeu.md`](../../../docs/regles-du-jeu.md). Point d'entrée `DailyModule.AddDaily()`.

## Rangement et dépendances

- `Application/` est rangée par usage (`Play/`, `Stats/`, `Archive/`, `History/`, `Admin/`, `Jobs/`, et à la racine le transverse : options, règles, erreurs, réponses, métriques, ports de lecture, contributeurs), **sous un seul espace de noms** `InSeconds.Api.Modules.Daily.Application` : un fichier nouveau va dans le dossier de son usage sans changer d'espace de noms.
- Daily n'utilise des autres que leurs `Contracts` : Players (`ICurrentPlayer`, `IPlayerDirectory`), Catalogue (`ITrackDirectory`, `ITrackPreviews`, `ITrackWaveforms`), Gameplay (`TrackRound`, `HintPolicy`, `IHintProvider`, `IAnswerMatcher`, `ISeededShuffle`). Il ne voit pas Runs ; de Social, il ne voit que ses `Contracts` : il implémente `IMemberScoreSource` (`DailyMemberScores`), jamais `IMemberPerformanceSource` (la Survie a son classement à part, pas de moyenne des modes).
- Daily implémente `ITrackUsage` (`EfTrackUsage`, aussi `IDailyTrackUsage` avec le cooldown), `IPlayerDataContributor` (`DailyPlayerData`, section `daily`), `IStreakGrants` (`DailyStreakGrants`, contrat offert à Players) et `IMemberScoreSource` (`DailyMemberScores`, contrat de Social).
- Ports : `IDailyStore` (`Domain/`), `IDailyQueries`, `IDailyStatsQueries`, `IDailyHistoryQueries`, `IDailyProfileQueries`, `IDailyTrackUsage` (`Application/`). Politiques : `ITrackSelector` / `CooldownSeededSelector`, `IDailyScoringPolicy`.
- Clés étrangères vers `players.players` et `catalogue.tracks` par le nom du type, en `RESTRICT`.

## Génération et cooldown

- Une seule logique (`GenerateDailyChallenge`, une transaction) pour la tâche de minuit, le secours à la volée au démarrage d'une partie et `/api/e2e/generate-today`. Verrou consultatif par jour (`LockGenerationAsync`, refuse de tourner hors transaction) : deux générations simultanées se suivent, la seconde voit le défi et ne tire rien.
- Tirage : candidats de `ITrackDirectory.ListPlayableIdsAsync` moins ceux en cooldown, **triés par identifiant** puis Fisher-Yates à graine (`DayNumber`) : le défi ne dépend ni de l'ordre de la base ni d'un doublon. Pool insuffisant : rien n'est écrit, la tâche lève `JobFailedException("admin.pool_insufficient")` et Hangfire réessaie toutes les 10 min pendant 24 h.
- Usage d'un morceau **calculé** sur `challenge_tracks`, jamais stocké. Un morceau tiré le jour J reste exclu tant que `LastUsedDate >= jour - cooldown` ; `UnlockDate` = dernier jour + cooldown + 1. Le cooldown suit la taille du pool (`TrackCooldownPolicy`, recalculé à chaque appel). `GetTracksInCooldownAsync` n'est appelé que par la génération (`Jobs/GenerateDailyChallenge.cs`) et le défi de demain de l'admin (`Admin/AdminNextChallenge.cs`).
- `Daily:TracksPerChallenge` ne change que les défis à venir : la fin de partie compte les morceaux réels (piège 38).

## Parties

- Le morceau en cours est le premier sans réponse ; verrou du morceau et plancher d'écoute (piège 35) portés par la session (`current_position`, `current_listened_seconds`, `current_hint_level`) et reconstitués en `TrackRound` (`RoundOfCurrentTrack`, qui borne le niveau d'indice à la politique). Le niveau d'indice ne vient jamais du client.
- **Seconde tentative** (piège 51) : une réponse qui n'est pas entièrement juste (`DailySession.CanOfferRetry` : ni « passer », ni vide, ni palier 0, ni déjà une tentative ratée, `Daily:RetryScorePercent` > 0) n'est pas enregistrée : `RecordFailedAttempt` garde le palier annoncé comme plancher, `current_failed_attempts` passe à 1 (remis à 0 par `ReleaseLock`) et la réponse porte `retry: true` sans rien de plus (jamais ce qui est juste). La seconde réponse est notée par `Score(outcome, isRetry: true)` (ordre : base, moitié, facteur, pénalité d'indice). `CurrentTrackState.FailedAttempts` et `DailySettingsResponse.RetryScorePercent` l'exposent. Tests : `SecondAttemptTests`, `DailyScoringAndRulesTests`.
- Concurrence : toute requête sur une partie la charge en `FOR UPDATE` (`FindSessionForUpdateAsync`) ; le démarrage prend un verrou par joueur (`LockPlayerStartAsync`, deux démarrages ne font qu'une partie) ; la série se lit et s'écrit sous `LockStreakAsync`. `FindChallengeAsync` et `FindStreakAsync` regardent d'abord le contexte (un ajout de la même transaction n'est pas encore en base).
- Fin de partie dans la même transaction que la dernière réponse : statut, série et gels **sur la date du défi** (piège 18). Les gels ne bougent que pour un compte. La veille reste jouable après minuit ; une partie plus vieille est refusée (`SessionAccess.OldestPlayableDay`).
- Rien qui identifie un morceau avant la réponse (piège 31) : ni dans le démarrage, ni dans `stats/today` tant que la partie n'est pas finie (terminée, expirée, ou abandonnée après au moins une réponse ; abandonnée sans réponse : rien).
- **Le texte tapé n'est jamais stocké ni journalisé** : seuls les verdicts.
- Une partie d'un autre joueur répond 404 (rien n'en est révélé).

## Statistiques

- Agrégats SQL (`GROUP BY` par position), jamais une ligne par réponse : `stats/today` est appelé par chaque joueur en fin de partie. Les joueurs effacés n'ont plus de parties : aucune lecture de la table des joueurs.
- Photo figée des jours terminés (`challenge_day_stats`, `DayStatsPayload` version 1) par `daily-close-day` à J-2 (piège 18) : d'abord `ExpireStaleSessions` (un `UPDATE` pour tous), puis `CloseChallengeDay` jour par jour, une étape en échec n'arrêtant pas la suite (`admin.close_day_failed` à la fin). Verrou par défi (`LockDayStatsAsync`) partagé avec le recalcul de l'admin (409 `admin.day_not_over` pour la veille et le jour même).
- `DayStatsCalculator.Build` est pur et partagé par la photo, la veille en direct et l'admin. Paliers et barème lus au calcul ; pas de pénalité d'indice recalculée (les scores sont ceux enregistrés).
- Réponses des jours passés (`Archive/ChallengeArchive.cs`) : jamais le jour même, **que des pourcentages arrondis** (une part non nulle ne tombe pas à 0), rien sous `ScoreDistribution.MinPlayersForPercent` (5) parties terminées ; le même seuil vaut pour `betterThanPercent`. L'extrait d'un jour passé est redemandé à chaque appel (piège 14). `sitemap.xml` (`Sitemap.cs`) répond aussi à `HEAD`.
- Historique du joueur (`History/DailyHistory.cs`) : le calendrier du mois (état de chaque jour de défi jusqu'à aujourd'hui, règle pure `Domain/HistoryCalendar.cs` : `played`, `unfinished`, `resumable` pour la veille encore en cours, `missed`, `today`) et les chiffres du mois, servis aussi sans identité (les défis seuls) ; toujours la date du défi (piège 18), jamais un morceau ni ce qu'il a tapé.
- Accueil d'un habitué (`GET /api/daily/today`, `recap` : `ReturnRecapResponse`, `IDailyHistoryQueries.GetReturnRecapAsync`) : seulement pour un compte avec au moins `ReturnRecapPolicy.MinGames` (14) parties terminées ; score d'hier, moyenne, parties et morceaux trouvés au premier palier sur les 7 jours jusqu'à hier, par date du défi (piège 18). Que les parties du joueur. Test : `TodayReturnRecapTests`.
- Bilan de la semaine (`History/WeekReviewEndpoint.cs`, `GET /api/daily/week-review`, calcul pur `Domain/WeekReview.cs`) : la semaine d'avant (lundi au dimanche), ses parties **terminées** par date du défi (piège 18), meilleur morceau par `IDailyHistoryQueries.GetBestAnswerAsync` ; calculé à la lecture, rien de stocké. Tests : `WeekReviewTests` (unitaires et intégration).
- « À réécouter » (`History/ReplayTracks.cs`, `GET /api/daily/replay`) : ses réponses ratées, seulement sur des jours publiés (jusqu'à la veille) et dans des parties qu'il ne peut plus jouer (tout sauf « en cours ») : rien du jour même ni de la veille encore en cours (pièges 31 et 18). L'extrait passe par la route de l'archive (piège 14).
- Profil d'oreille (`Profile/EarProfileEndpoint.cs`, `GET /api/daily/profile`, calcul pur `Domain/EarProfile.cs`, port `IDailyProfileQueries`) : agrégats SQL, comparaisons aux joueurs seulement au-dessus des seuils (5 parties par point, `AnswerSpeedHistory.MinAnswers` réponses). La meilleure série est **stockée** (`daily.streaks.best_streak`, tenue par `DailyStreak.RecordCompletion`, gels compris, dans l'export RGPD).
- Scores des groupes (`Persistence/DailyMemberScores.cs`, règles pures `Domain/DailyPeriodScores.cs` et `Domain/TodayReveal.cs`) : jour, semaine et jour passé (`GetDayAsync`, caché tant que `HiddenDays` le contient), calculés à la lecture sur les parties **terminées** et la **date du défi** (piège 18), rien de stocké. Jour : la partie du jour ; semaine : somme des 7 derniers jours, jour en cours compris, un jour manqué vaut 0. Les scores du jour ne sont rendus qu'au joueur qui a fini la sienne (`TodayReveal`, la même règle que `stats/today`, piège 31 : terminée, ou abandonnée après une réponse) ; avant, seulement qui a joué. Un défi qu'il peut encore jouer sort de la semaine qu'il voit (`DailyPeriodScores.HiddenDays`, sinon l'écart trahirait les scores des autres) : le jour en cours tant qu'il n'est pas fini, et la veille aussi tant que sa partie de la veille est en cours (elle se finit après minuit, piège 18).

## Administration

- `GET /api/admin/daily/stats?days=7|30|90` (`Admin/AdminStats.cs`, onglet Stats) : activité par jour, parties par issue, réponses, et retours J+1 / J+7 par source et par classe d'appareil (`ReturnCohorts`, calculé à la lecture sur les parties, rien de stocké). Une cohorte n'est comptée éligible que si `jour + n < aujourd'hui` ; les arrivées viennent de `IPlayerDirectory.ListArrivalsAsync`. Période hors 7/30/90 : 400 `admin.invalid_period`. Tests : `ReturnCohortsTests`, `AdminStatsTests`.
- `GET /api/admin/players` est servie par Daily (elle mêle les comptes, lus par `IPlayerDirectory`, et la série) ; ses routes sont dans le document OpenAPI de Daily.
- Pseudo et titre joints à la lecture, jamais figés dans la photo.
- Réglage du cooldown : écrit par `SettingsStore.SetAsync`, route `[NonTransactional]` (dans la transaction, le rechargement lirait la base avant l'enregistrement).

## Journaux et métriques

- `DailyLog` : 1000 à 1005 (parties), 1300 à 1311 (génération, stats, tâches, réglage de la seconde tentative invalide). **Le texte du 1002 est lu par Grafana**, et le tableau « Un joueur » filtre sur le début des messages (« Réponse de », « Indice niveau ») : `UnitTests/Daily/DailyLogTests` fige ces textes, mettre le tableau à jour si l'un change. Le 1002 donne le morceau attendu, jamais la saisie.
- `DailyMetrics` (compteurs `inseconds.daily.*`, dont `retries` : secondes tentatives offertes, et l'étiquette `retry` des réponses) nourrit le tableau « Activité » : renommer une métrique ou une étiquette vide ses panneaux.
