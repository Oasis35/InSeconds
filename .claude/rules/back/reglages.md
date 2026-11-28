---
paths:
  - "src/back/**/*Options*.cs"
  - "src/back/**/Settings/**"
  - "src/back/**/appsettings*.json"
  - "src/back/InSeconds.Api/Modules/*/Application/*Support.cs"
  - "src/back/InSeconds.Api/Modules/*/Application/*Rules.cs"
  - "docs/regles-du-jeu.md"
  - "docs/runs/regles.md"
---
# Réglages

## Mécanisme (`InSeconds.Api/Infrastructure/Settings`)

- Table `infra.settings` : `key` = chemin de configuration complet (`Daily:GuessTimerSeconds`), `value` en `jsonb`. `DatabaseSettingsConfigurationProvider` l'aplatit dans `IConfiguration` (`SettingsJsonFlattener` : objet → `clé:propriété`, tableau → `clé:0`, `clé:1`…). Il n'ignore que « base, schéma ou table absents » ; toute autre erreur SQL empêche le démarrage (piège 8).
- Lecture par `IOptionsMonitor<T>` : **tout est relu à chaud**. Écrire : `SettingsStore.SetAsync(key, value)` (upsert puis rechargement ; appelant `[NonTransactional]`). Après une écriture SQL directe : `ISettingsReloader.Reload()`.
- Ajouter un réglage = une propriété avec sa valeur par défaut, aucune ligne en base. **Pas de valeur initiale sur une liste ou un dictionnaire** (le binder ajoute les éléments lus à ceux de la valeur initiale : défaut dans une propriété `Effective…`, seule lue par le code). **Pas de clé de dictionnaire décimale** (le binder laisse le dictionnaire vide sans erreur : liste d'objets, comme `DurationScores`) ; clés `string`, entières ou `enum` permises.
- Contrôle : `DailyOptionsStartupCheck` (`DailyOptionsChecks.Problems`) et `RunsOptionsStartupCheck` (`RunsOptionsChecks.Problems`) refusent le démarrage sur une valeur incohérente ; à chaud, la valeur fautive retombe sur le défaut (`DailyRules`, `RunsRules.Current()`, `SocialRules`), erreur journalisée une fois par valeur. Un réglage du jeu changé ne fait jamais tomber une partie en cours.
- Les réglages `Runs:` (hors `Diversity` et `Levels`) sont **figés dans chaque défi** à sa création (`RunRules`).

## Réglages du jeu (`infra.settings`)

| Clé | Défaut | Bornes, remarque |
|---|---|---|
| `Daily:TracksPerChallenge` | `5` | au moins 1 ; ne change que les défis à venir (piège 38) |
| `Daily:TrackCooldownPoolPercent` | `75` | 10 à 90 ; cooldown en jours = ⌊ jouables × part ÷ `TracksPerChallenge` ⌋, recalculé à chaque tirage ; modifiable depuis l'admin |
| `Daily:GuessTimerSeconds` | `20` | exposé au front, appliqué nulle part |
| `Daily:AllowedDurationsSeconds` | `[0.5,1,1.5,2,3,5,10]` | positifs, moins de 100 s, deux décimales au plus (`numeric(4,2)`) |
| `Daily:DurationScores` | `[{"seconds":0.5,"score":1000},{"seconds":1,"score":850},{"seconds":1.5,"score":700},{"seconds":2,"score":550},{"seconds":3,"score":400},{"seconds":5,"score":250},{"seconds":10,"score":100}]` | liste d'objets ; secondes positives, points non négatifs |
| `Daily:RetryScorePercent` | `70` | 0 à 100 ; part du score de la seconde tentative, 0 la désactive (piège 51) |
| `Daily:StreakFreezeEveryDays` / `StreakFreezeMax` / `StreakLostNudgeMinDays` | `7` / `2` / `2` | non négatifs ; 0 jour : aucun gel gagné |
| `Runs:Lives` | `3` | 1 à 10, figé |
| `Runs:TracksPerRound` | `3` | 1 à 20, figé |
| `Runs:RegainLife` / `ShortenOnNoLifeLost` / `HoldOnLifeLost` | `true` / `true` / `true` | figés ; une playlist plus ancienne les lit à `false` |
| `Runs:MaxRounds` | `8` | 0 à 50 (0 : sans plafond), figé |
| `Runs:LifeBonus` / `CompleteBonus` | `250` / `500` | 0 à 100 000, figés |
| `Runs:ListenLadder` | `[10,5,3,2,1,0.5]` | 2 à 10 durées strictement décroissantes, positives, sous 100 s, deux décimales au plus ; le dernier palier se répète ; figé |
| `Runs:StepPoints` | `[100,200,350,550,800,1200]` | un nombre positif par palier, figé |
| `Runs:AnswerSeconds` | `45` | 0 (pas de chrono) ou plus long que le premier palier et 600 au plus, figé |
| `Runs:RankBands` | `8` | 1 à 20, figé |
| `Runs:Diversity:PoolPercent` / `ThemePercent` / `MaxGames` | `40` / `50` / `30` | 0 à 90 / 0 à 100 / 1 à 200 ; 0 coupe la règle ; jamais figés |
| `Runs:Levels:OldWeightPercent` / `MaxDropPercent` | `80` / `10` | 50 à 95 / 0 à 50 ; jamais figés |
| `Runs:Levels:InactivityGraceDays` / `InactivityWeeklyDropPercent` / `InactivityFloorPercent` | `14` / `5` / `50` | 1 à 365 / 0 à 50 / 0 à 100 ; calculé à la lecture |
| `Runs:Levels:Discs` | `runs.discs.scratched` 300, `bronze` 900, `silver` 2000, `gold` 3600, `platinum` 6000, `double_platinum` 9600, `diamond` 13000 | liste d'objets `{"disc":"runs.discs.gold","points":3600}`, 1 à 12 disques distincts, premier seuil au-dessus de 0, points strictement croissants |
| `Social:MaxMembersPerGroup` / `MaxGroupsPerPlayer` / `MaxNameLength` | `15` / `5` / `24` | 2 à 100 / 1 à 50 / 3 à 40 ; hors bornes : défaut |
| `Players:ReservedContains` / `ReservedWords` / `ReservedExact` | listes de départ de `ReservedNameDefaults` | listes de termes ; une liste renseignée remplace celle de départ en entier, une liste vide la garde ; relues à chaud (voir `players-auth.md`) |
| `Catalogue:CoverUrlTemplate` | `https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg` | pochette reconstruite depuis `cover_hash` |
| `Catalogue:Refresh:BatchSize` / `BatchDelay` | `10` / `00:00:01.5` | cadence du contrôle nocturne et des candidats (Deezer : ~50 requêtes / 5 s) |
| `Catalogue:Waveform:ComputeOnAdd` / `DelayMinutes` | `true` / `15` | `false` au staging (piège 50) |

## Configuration technique (fichiers `appsettings*.json`, variables d'environnement)

| Clé | Défaut | Remarque |
|---|---|---|
| `App:PublicUrl` | aucun | adresse absolue exigée au démarrage (liens des emails, sitemap) |
| `Auth:TrustedOrigins` | vide | fronts locaux autorisés à vérifier un lien magique (piège 22) |
| `Cors:AllowedOrigins` | vide | prod et staging seulement |
| `Deezer:BaseUrl` / `ResilienceEnabled` / `PreviewHostSuffix` | `https://api.deezer.com` / `true` / `.dzcdn.net` | `false` et `localhost` dans l'hôte de test et `ApiFactory` |
| `Jobs:Server:Enabled` / `Jobs:Server:WorkerCount` | `true` / `2` | serveur coupé dans les tests d'intégration |
| `Jobs:<id>:Cron` | cron de la tâche | staging décalé de 30 min, `catalogue-refresh` jamais au staging |
| `Healthchecks:PingKey` / `BaseUrl` | vide / `https://hc-ping.com` | sans clé, aucun signal ; clé propre au staging |
| `RateLimiting:Enabled` | `true` | `false` en test |
| `EmailRedirect:To` | vide | obligatoire au staging |
| `Brevo:ApiKey` / `SenderEmail` / `SenderName` | vide | `ApiKey` et `SenderEmail` vérifiés au démarrage en prod et staging |
| `DataProtection:CertificatePath` / `CertificatePassword` | vide | exigés en prod et staging (piège 17) |
| `Database:MigrateOnStartup` | `true` | `false` : migrations par `--migrate-only` seulement |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | absent | export OTLP, prod seulement |
