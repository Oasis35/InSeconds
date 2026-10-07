# InSeconds v2 : plan de développement jusqu'à la mise en prod

30/09/2026. Ce plan découpe le chantier en PR, dans l'ordre. Le « quoi » (modèle, architecture, règles, import, sécurité) est dans [PLAN.md](PLAN.md). Ici, on ne répète que ce qui sert à ordonner le travail.

**Go donné le 30/09 pour A1 (PR #204).** Chaque étape suivante attend le go de Clément.

---

## 1. Vue d'ensemble

| Phase | Contenu | PR | Jalon à la fin |
|---|---|---|---|
| 0 | Prérequis | 0 | environnement de Claude prêt, go |
| A | Socle back, front, CI, staging | 6 | **J1** : le staging répond en v2 (page vide mais saine) |
| B | Players (joueurs, connexion, profil) | 5 | **J2** : on se connecte et on gère son profil sur le staging v2 |
| C | Catalogue (morceaux, Deezer, pool admin) | 3 | le pool admin fonctionne en v2 |
| D | Gameplay (la manche) | 2 | la manche fonctionne, testée seule |
| E | Daily (défi, parties, série, stats) | 5 | **J3** : une partie complète en v2, tous les E2E du jeu verts |
| F | Admin | 2 | **J4** : parité, plus aucun E2E désactivé |
| G | Préparation de la bascule et recette | 4 + recette | **J5** : deux répétitions de bascule sans intervention |
| H | Mise en prod | 0 (workflow) | prod en v2 |
| I | Après la mise en prod | 3 | v1 supprimée, `src/v2` → `src` |

Environ **30 PR**. Les plus grosses sont A1, B1, E2 et E5. L'ordre A → B → C → D → E → F est imposé par les dépendances (Daily a besoin de Players, Catalogue et Gameplay). C et D peuvent avancer en parallèle.

**Deux principes qui traversent tout le plan :**
- **L'import se construit module par module.** Chaque phase ajoute sa partie de `10-import.sql` et de `20-verify.sql`, avec ses tests dans `InSeconds.MigrationTests`. On découvre les surprises de données tôt, pas à la fin, et le staging v2 affiche de vraies données (anonymisées) dès la phase B.
- **Les E2E sont activés au fil de l'eau.** Ils sont copiés en phase A, tous désactivés dans une liste visible, puis réactivés par la PR qui livre la fonctionnalité. La liste doit être vide au jalon J4.

---

## 2. Phase 0 : prérequis

| Qui | Action | Pourquoi |
|---|---|---|
| Clément | Go de démarrage | aucune ligne de code avant |
| Clément | Autoriser `builds.dotnet.microsoft.com` dans l'accès réseau de l'environnement (Project settings → Environment) | aujourd'hui, le SDK .NET ne peut pas s'installer dans l'environnement de Claude (vérifié le 30/09 : 403). Sans lui, Claude ne peut ni compiler ni lancer les tests .NET en local, et chaque PR n'est vérifiée que par la CI : c'est beaucoup plus lent. NuGet, npm et Docker sont déjà accessibles. |
| Claude | Script d'installation de l'environnement (SDK .NET 10, `dotnet-ef`) | pour que chaque session parte prête |
| Clément | ✓ Fait le 30/09 : ruleset « Branches protégées » sur `main` et `env/staging` (suppression et force push bloqués, PR obligatoire, exemption admin). « Require status checks » sera ajouté avec le check « CI OK » de la PR A5 | `env/staging` devient la branche de la v2 pendant tout le chantier |

**Flux Git pendant le chantier :**
- les PR v2 visent `env/staging` ; chaque merge déploie le staging v2 ;
- les correctifs urgents v1 vont directement dans `main` ; **après chacun, `main` est mergé dans `env/staging`** (le correctif v1 arrive dans `src/back`/`src/front` de la branche) et reporté en v2 si besoin (noté dans `docs/TACHES`) ;
- à la mise en prod, `env/staging` est mergé dans `main` : c'est ce merge qui amène la v2 sur `main`.

---

## 3. Phase A : socle

| PR | Contenu | Terminée quand |
|---|---|---|
| **A1** Socle back | solution `src/v2/back` (projets du § 5.1) ; `Program.cs` de composition ; `InSecondsDbContext` (snake_case, schémas, `citext` dans `extensions`), migration initiale, historique dans `infra` ; point d'entrée `--migrate-only` ; `TimeProvider`/`GameCalendar` ; `ProblemDetails` avec code et `traceId` (S12) ; fournisseur de settings `infra.settings` avec rechargement (R13) ; `/health`, `/health/ready` ; Workstation GC (piège 24) ; tests d'architecture | build, tests unitaires et d'architecture verts ; `--migrate-only` testé |
| **A2** Wolverine et Hangfire | Wolverine.Http, codegen statique (vérifié en CI), `AutoApplyTransactions`, outbox dans `messaging` ; **test transaction + outbox** (A1 du § 12 ter) ; Hangfire (schéma `jobs`), tableau de bord `/jobs` (policy Admin, `Authorization = []`, S3) ; `GET /api/admin/jobs/{id}` ; test d'enregistrement des tâches | tests d'intégration verts ; `/jobs` refuse un non-admin |
| **A3** Infrastructure | Brevo + redirection staging ; OpenTelemetry (mêmes règles de confidentialité) ; `TrustedProxyNetworks` (piège 27) ; politiques de rate limiting ; en-têtes de sécurité de l'API (S15) ; `InSeconds.Api.Testing` (reset, faux email ; le faux Deezer arrive avec C1, qui crée le port Deezer) ; squelette `SecurityTests` ; `Dockerfile` de prod v2 | tests verts ; image de prod sans `Api.Testing` (S9) |
| **A4** Socle front | projet `src/v2/front` (Angular 22, Tailwind, tokens DA repris) ; `core` (erreurs par code, langue, session), `ui` (bouton, modale, panneau bas, toast) ; routes et redirections (query string gardée) ; `withRequestStatus` ; i18n par domaine + test de synchronisation FR/EN ; Sheriff ; Vitest ; PWA (`SwUpdate`, `safety-worker.js`) ; overlay « Service indisponible » ; avis `from=legacy` | build, Vitest, Sheriff verts |
| **A5** CI | jobs v2 dans `ci.yml` (`dorny/paths-filter` + job agrégateur « CI OK ») ; E2E copiés dans `src/v2`, tous listés comme désactivés, check qui compare les listes v1/v2 ; `nginx-headers` étendu à la v2 (`ngsw.json`) ; Dependabot : groupes v2 | CI verte, temps d'un run sans changement v2 inchangé |
| **A6** Staging v2 | `docker-compose.staging.yml` et `deploy.sh staging` construisent la v2 ; CORS de l'API v2 pour `dev.inseconds.cc` et `POST /api/client-errors` (le front v2 les appelle dès A4) ; image front v2 (nginx, `ngsw.json` sans cache) ; migrations au déploiement ; certificat Data Protection du staging monté ; test de fumée après déploiement (endpoints de test absents, en-têtes, `/jobs` protégé) | **J1** : `dev.inseconds.cc` sert la v2 |

**Fait en A4 :** en plus du contenu prévu, `ui/error-message`, `SessionStore` (vide jusqu'à B1), le port `StoragePort`, le job CI `front-v2` (build, Vitest, Sheriff) qu'A5 fera passer derrière le filtre par chemin. Front v2 en dev sur le port 5176, API relayée par le proxy d'`ng serve`. L'image Docker et `nginx.conf` du front v2 sont repoussés en A5/A6, où ils sont testés.

**Fait en A5 :** job `changes` (`dorny/paths-filter` ; base : `env/staging` pour un push sur une branche de travail, le commit d'avant le push sur `main`/`env/staging`, la branche cible pour une PR) ; `back-v2`, `front-v2` et `nginx-headers-v2` tournent tous dès que `src/v2/**` (ou `ci.yml`) change (PLAN § 9.1 : en parallèle des jobs v1, ils n'allongent pas le run), `e2e-parity` dès qu'un E2E v1 ou v2 change, les jobs v1 tournent toujours ; job `CI OK` qui agrège tous les jobs (sauté = réussi), seul check à exiger dans le ruleset ; les déploiements ne changent pas. E2E copiés, désactivés par `e2e/disabled-specs.json` (`testIgnore`), parité par `scripts/check-e2e-parity.mjs` avec écarts justifiés dans `e2e/parity-exceptions.json`. L'image front v2 (`Dockerfile.prod`, `nginx/`) est faite ici (testée par `nginx-headers-v2`), A6 la branche sur le staging. Pas de job E2E v2 tant que tous les specs sont désactivés : il arrive avec B5. Dependabot : `nuget` et `npm` v2 avec `target-branch: env/staging`.

**Action de Clément après A5 :** ajouter le check « CI OK » dans « Require status checks » du ruleset « Branches protégées ».

**Action de Clément avant le merge d'A6 :** ~~certificat Data Protection du staging~~ fait le 30/09 (`~/apps/InSeconds-staging/secrets/dataprotection.pfx`). Reste, sur le VPS : son mot de passe dans `.env.staging` sous `DATA_PROTECTION_CERTIFICATE_PASSWORD`, et le rendre lisible par l'utilisateur de l'image de l'API (uid/gid 1654) : `sudo chgrp 1654 secrets/dataprotection.pfx && sudo chmod 640 secrets/dataprotection.pfx`. Sans les deux, le déploiement du staging s'arrête avant de remplacer la v1.

**Fait en A6 :** `docker-compose.staging.yml` construit la v2 (mêmes noms de conteneurs, Caddy inchangé), certificat monté en lecture seule sur `/run/secrets/dataprotection.pfx`, clés de configuration `DataProtection:CertificatePath`/`CertificatePassword` réservées pour B1. `deploy.sh staging` : vérifie le certificat (présent sur le VPS, puis lisible dans le conteneur), migrations par `--migrate-only` dans un conteneur jetable **avant** de remplacer les conteneurs, puis test de fumée `deploy/vps/smoke-test.sh` (routes de test sondées en GET, pour qu'une route présente réponde 405 sans rien exécuter). CORS de l'API v2 (`Cors:AllowedOrigins` : `dev.inseconds.cc` en staging, `inseconds.cc` et `www.inseconds.cc` déjà posées pour la prod, aucune en dev et en E2E) et `POST /api/client-errors` (contrat, limites, journal EventId 1100 de la v1 ; query string retirée côté serveur). Le job `deploy-staging` attend désormais « CI OK » (jobs v1 et v2) au lieu des seuls jobs v1.

---

## 4. Phase B : Players

| PR | Contenu | Terminée quand |
|---|---|---|
| **B1** Identité et cookie | tables `players`, `accounts`, `device_sessions`, `legacy_tokens`, `auth_tokens` ; cookie standard (`AddCookie`, `__Host-`, `OnValidatePrincipal` avec cache 1 min, `last_seen_at` toutes les 5 min) ; une erreur de base ne déconnecte jamais (piège 37) ; `POST /api/players/guest` (rate limit), `GET /api/players/me` ; policy Admin, `GET /api/admin/me` ; Data Protection chiffrée par certificat ; middleware de transition des cookies v1 (paramètres v1, une session par appareil) | tests d'intégration verts, dont révocation en moins d'une minute |
| **B2** Connexion | magic link : handler de l'outbox qui génère le jeton (S1), filtre `purpose` (S2), `OriginValidator` (piège 22), pas de conversion d'un compte lié (piège 30), nouvelle session à chaque connexion (S5) ; gel offert à la conversion (via Daily plus tard, contrat préparé) ; gabarits d'email repris ; dev-login | tests d'intégration des pièges 21, 22, 30 verts |
| **B3** Profil | pseudo, changement d'email (demande + confirmation), déconnexion (révocation), appareils (liste, révocation, « déconnecter les autres ») ; purge des jetons expirés (tâche Hangfire) | tests verts |
| **B4** Import Players | `deploy/migration-v2/` (squelette, `run-import.sh`, `import_state`) ; partie Players de l'import et de la vérification ; projet `InSeconds.MigrationTests` (base v1 générée en CI) ; **test de bout en bout du cookie v1**, dont deux navigateurs ; workflow « Import v1 → staging v2 » (copie `public`, anonymisation avant et après) | import staging sans écart pour les joueurs |
| **B5** Front account | `/account/login`, `verify`, profil, appareils, confirmation d'email ; `BrowserId` ; header avec avatar et série (vide jusqu'à Daily) ; **identité du joueur dans la télémétrie du back** (équivalent de `PlayerTelemetryMiddleware` v1 : tag `inseconds.player_id` sur la trace, scope de log `PlayerId`, à partir d'`ICurrentPlayer`, sans email ni pseudo) | **J2** : E2E login, profil, changement d'email réactivés et verts |

**Fait en B1 :** module `Players` (`InSeconds.Api/Modules/Players/` : `Domain`, `Application`, `Contracts`, `Persistence`), migration `PlayersAndDataProtectionKeys` (schéma `players` et `infra.data_protection_keys`). Décisions :
- `device_sessions.id` tiré d'une séquence EF (HiLo) dès l'ajout : l'identifiant va dans le cookie avant que Wolverine n'enregistre la transaction, sans `SaveChangesAsync` dans le handler ;
- cookie `__Host-inseconds` en prod et en staging, `inseconds` en développement et en test ; claims `player_id` et `device_session_id` seulement, le rôle admin n'y est ni écrit ni lu (relu en base à chaque requête) ;
- validation de l'appareil dans un cache dédié (pas l'`IMemoryCache` partagé, piège 24), fraîcheur jugée sur `TimeProvider` ;
- `GET /api/players/me` en `[NoContentIfMissing]` : le 204 sans renvoyer d'`IResult` ;
- certificat Data Protection exigé seulement quand l'API démarre (pas pour `codegen write`, lancé par la CI sans certificat) ;
- CHECK de `auth_tokens` : connexion = adresse sans nouvelle adresse, changement d'email = joueur et nouvelle adresse ;
- convention EF qui retire la déclaration de `citext` hors schéma qu'Npgsql ajoute de lui-même (`citext` reste dans `extensions`) ;
- conversion d'un cookie v1 : un même jeton converti depuis moins d'une minute retrouve sa session (`LegacyConversionCache`) ; sinon les requêtes parallèles du premier chargement ouvraient plusieurs sessions pour un seul navigateur, et un cookie v1 rejoué en boucle remplissait la table (revue de la PR, 03/10) ;
- tests : `TestAuthHandler` renvoie au vrai cookie sans en-tête de test ; `TestCertificate` pour les tests en staging et en prod.

Laissé aux PR suivantes : `user_agent_label` reste vide (calculé avec la liste des appareils, B3) ; aucun compte n'est encore créé par l'API (conversion en B2), les tests insèrent `accounts` en SQL.

**Fait en B2 :** `POST /api/players/auth/magic-link` (toujours 204) et `POST /api/players/auth/magic-link/verify` (`{ token, pseudo? }` → `{ needsPseudo }`), dev-login dans l'hôte de test. Pas de migration (tables posées en B1). Décisions :
- S1 : le message `SendMagicLinkEmail` ne porte que l'adresse ; son handler génère le jeton, l'enregistre et envoie l'email dans la même transaction (un échec d'envoi n'enregistre rien) ; un lien par minute et par adresse, comme en v1 ;
- jeton et hash calculés comme en v1 (base64url, SHA-256 du texte), pour que l'import des jetons reste valable (R14) ;
- vérification en étapes Wolverine (`Before` pour l'origine, `LoadAsync`, `Validate`, `Post`) ; le jeton n'est consommé qu'à la connexion effective, pas à l'étape du pseudo ni sur un pseudo pris ;
- usage unique même sous concurrence : le jeton est lu en `FOR UPDATE`, une seconde confirmation simultanée (double clic) attend puis reçoit 400 (la v1 acceptait les deux) ; un pseudo pris au même moment par quelqu'un d'autre donne 409, pas 500 (`PseudoTakenExceptionHandler`, comme la v1) ;
- connexion partagée (`AccountSignIn` : préparation sans écriture, puis exécution) entre la vérification et le dev-login ; le compte d'un joueur supprimé est refusé comme un lien invalide ;
- S5 : à chaque connexion, nouvelle session, et l'ancienne session du navigateur révoquée et retirée du cache de validation (refusée dès la requête suivante, pas après la minute de cache) ;
- origines de confiance (piège 22) : `Cors:AllowedOrigins` + `Auth:TrustedOrigins`, la v2 n'ayant aucune origine CORS en dev et en E2E (proxy d'`ng serve`) : 5176 et 5178 dans l'hôte de test ;
- `App:PublicUrl` (même clé qu'en v1) pour le lien, vers `/account/login/verify` ;
- gel offert : contrat `IStreakGrants.GrantAccountCreationFreezeAsync` dans `Modules/Daily/Contracts`, appelé dans la transaction de la création du compte (conversion ou nouveau joueur) ; implémentation vide jusqu'à E2 ;
- `PlayerLinked` (§ 5.4) n'est pas publié : aucun module ne l'écoute encore, il viendra avec son premier consommateur ;
- `IEmailSender` résolu par le conteneur dans le code généré (`AlwaysUseServiceLocationFor`), seule exception à la règle.

**Fait en B3 :** `PUT /api/players/me/pseudo`, `POST /api/players/me/email-change` et `POST /api/players/email-change/confirm`, `POST /api/players/auth/logout`, `GET /api/players/me/devices`, `DELETE /api/players/me/devices/{id}`, `POST /api/players/me/devices/revoke-others`, tâche `players-purge-expired-tokens`. Pas de migration. Décisions :
- S11 : limites **par joueur** pour la demande de changement d'email (5 / 10 min, par IP en v1) et pour les révocations (`device-revocation`, 20 / 10 min, un appareil ou « déconnecter les autres ») ; la clé du joueur est fournie par l'API à l'infrastructure, qui retombe sur l'IP sans joueur identifié ;
- changement d'email comme la connexion : jeton généré par le handler du message (S1), un lien par minute, à la nouvelle adresse seulement (v1) ; confirmation publique, sans contrôle d'origine (aucun cookie posé, v1) ; adresse prise entre-temps : 409, jeton gardé ; course sur l'index unique : 409 aussi (`AccountConflictExceptionHandler`, ex-`PseudoTakenExceptionHandler`, couvre désormais l'adresse) ;
- révocation (déconnexion, un appareil, les autres) : `revoked_at` et retrait du cache de validation, refusée dès la requête suivante ; déconnecter un appareil ne touche pas les autres (piège 39) ; « déconnecter les autres » supprime aussi le jeton v1 du joueur (`legacy_tokens`) : un appareil qui n'a pas encore converti son cookie v1 est un « autre appareil » (S6) ; l'appareil d'un autre joueur répond 404 comme un inconnu ;
- routes de compte (pseudo, changement d'email) : 403 `players.guest_forbidden` pour un invité ; appareils et déconnexion ouverts à tout joueur identifié ;
- `user_agent_label` sans langue (« Chrome · Android » plutôt que « Chrome sur Android ») : le front l'affiche tel quel dans les deux langues ;
- purge : tous les jetons expirés, des deux usages (consommés compris), chaque nuit.

**Fait en B4 :** `deploy/migration-v2/` (`run-import.sh`, `00-import-state.sql`, `10-import.sql`, `20-verify.sql`, `90-import-done.sql`, `import-to-staging.sh`, README), partie Players de l'import et de la vérification, projet `InSeconds.MigrationTests`, test de bout en bout du cookie v1. Décisions :
- import, vérification et état dans **une seule transaction** (`psql --single-transaction`) : une vérification en échec annule l'import ;
- les clés Data Protection font partie de B4 : sans elles, le test de bout en bout du cookie v1 n'a pas de sens ;
- `infra.import_state` créée par l'import lui-même (hors migrations EF), `imported_at` noté à chaque import réussi ; la garde (`opened_at`, `--force`) reste en G1 ;
- pré-contrôles avec messages clairs (identifiants seulement, S13) : pseudos en doublon de casse, compte sans email ;
- tests : le **vrai `run-import.sh`** tourne dans le conteneur PostgreSQL de test (POSIX `sh`, scripts copiés en LF : la copie de travail Windows est en CRLF) ; schéma v1 généré par `dotnet ef migrations script` (CI : étape dédiée du job `back-v2`) ;
- workflow : le workflow manuel « Copy prod DB to staging » existant fait l'import quand il est lancé depuis `env/staging` (un nouveau workflow manuel ne serait listé qu'une fois sur `main`, donc pas avant la bascule) ;
- deux appareils qui convertissent le même cookie v1 dans la même minute partagent une session (`LegacyConversionCache`, B1) : le test de bout en bout avance l'horloge entre les deux navigateurs ;
- **clé Data Protection neuve après chaque import** (relevé en revue) : l'import copie les clés v1 en clair, et la plus récente serait devenue la clé par défaut de la v2 (S16 contourné jusqu'à 90 jours). Commande `--rotate-data-protection-key` (`IKeyManager.CreateNewKey`, chiffrée par le certificat), lancée par `import-to-staging.sh` après la seconde anonymisation (qui vide les clés) ; **à reprendre dans le workflow de bascule (G2), juste après l'import et avant le démarrage de l'API**. Testée avec le vrai certificat, y compris la preuve du risque sans rotation ;
- pré-contrôle des adresses en doublon de casse (comme les pseudos) ; jetons envoyés par email comparés champ par champ (hash, adresse ou joueur, dates) ; seconde anonymisation alignée sur le plan (`legacy_tokens` et file `messaging` vidés).

**Fait en B5 :** domaine front `account` (`src/v2/front/InSeconds.Client/src/app/account/`, quatre couches), client NSwag des joueurs, en-tête avec l'avatar, identité du joueur dans la télémétrie du back, job CI `e2e-v2` et 12 E2E réactivés (login 5, profil 4, changement d'email 3) : **jalon J2**. Décisions :
- **Écrans** : `/account/login`, `/account/login/verify` (bouton « Confirmer » explicite, piège 21 ; avertissement « déjà connecté », piège 30), `/account/confirm-email`, `/account/profile` (pseudo, changement d'email, appareils connectés avec « déconnecter les autres », déconnexion avec confirmation). Les adresses de la v1 restent redirigées (query string gardée, testé). Le profil est réservé aux comptes (`linkedAccountGuard`, qui attend la lecture de l'identité) : un invité est renvoyé vers la connexion.
- **Pas repris de la v1** : les boutons de connexion rapide (dev-login) de l'écran de connexion (hors périmètre) ; les cartes « Série » et « Parties jouées » du profil (leurs données arrivent avec Daily, E2). Un envoi de lien refusé (429, réseau) affiche maintenant l'erreur et son code au lieu du message « lien envoyé » (la v1 masquait tout échec ; la réponse de l'API est de toute façon la même que l'adresse ait un compte ou non).
- **Données** : `SessionStore` gagne l'`email`. L'identité est lue au démarrage (`GET /api/players/me`, 204 sans identité) sans bloquer l'affichage ; seules les routes réservées aux comptes l'attendent. Après une connexion ou un changement d'email, l'identité est relue plutôt que devinée (après un changement de pseudo, la session reprend le pseudo renvoyé par le serveur). Deux lectures qui se croisent (démarrage, puis relecture juste après une connexion) : seule la plus récente écrit dans la session (`SessionLoader`, relevé en revue).
- **Client NSwag** (§ 6.1 du plan) : un client par module, généré depuis un document OpenAPI par module servi par l'**hôte de test seulement** (`/openapi/players.json`, jamais dans l'image de prod) et sauvegardé dans `InSeconds.Api.Testing/openapi/players.json` (un test d'intégration échoue si un endpoint Players change sans régénération). Sortie : `src/app/api/players/api.generated.ts` (même nom de fichier qu'en v1, couvert par l'exclusion Sonar `**/api.generated.ts`, posée en Source File Exclusions **et** en Duplication Exclusions depuis la revue de B5) ; `npm run generate-api` (config dans `nswag/`). Seule la couche `data-access` l'importe, par l'adaptateur `PlayersApi`. `toAppError` lit ce que lève un client NSwag (`ApiException` ou `ProblemDetails` décrit dans OpenAPI).
- **En-tête** (`core/shell/app-header`) : avatar (initiale du pseudo, titre = pseudo, lien vers le profil) pour un compte, lien « Se connecter » sinon ; emplacement de la série vide jusqu'à Daily. Superposé en haut de page, il ne décale aucun écran.
- **BrowserId** : composant du domaine `account` (il crée l'invité par `POST /api/players/guest` s'il n'y a pas d'identité). En attendant l'admin (F), il s'affiche sur le profil d'un admin ; l'admin n'aura qu'à l'importer (`DOMAIN_DEPENDENCIES`).
- **Télémétrie** : `PlayerTelemetryMiddleware` v2 (tag `inseconds.player_id` sur la trace, scope de log `PlayerId`, d'après `ICurrentPlayer`, sans email ni pseudo), cf. `src/v2/back/CLAUDE.md`.
- **E2E** : les 12 titres de la v1 sont gardés (parité vérifiée), les corps sont adaptés — l'écran d'accueil du jeu n'existe pas avant E5, la connexion se vérifie par l'avatar de l'en-tête, la déconnexion par le lien « Se connecter » de l'en-tête. Écarts de scénario, justifiés : le profil ne montre plus « Série » et « Parties jouées » (Daily ; **assertions de `profile.spec.ts` à remettre quand Daily les affiche**) ; « Retour au profil » d'un invité aboutit à la connexion (garde). La fixture lit le lien dans le dernier email de l'hôte de test (`/api/e2e/last-email`) et attend un lien différent du précédent (l'email part de l'outbox, après la réponse 204). L'hôte de test se lance avec `--no-launch-profile` (sinon `launchSettings.json` impose `Development`, piège 9 de la v1). Job `e2e-v2` : même schéma que le job `e2e` de la v1, dans « CI OK ».
- **Autres** : `scripts/check-pure-domain.mjs` corrigé pour Windows (`fileURLToPath`), premier domaine à avoir une couche `domain/` ; les aides de test (`**/testing/**`) sont exclues du build de l'app.

**Action de Clément après B4 :** une fois le merge déployé sur le staging (l'image de l'API doit contenir `--rotate-data-protection-key`), lancer « Copy prod DB to staging » depuis `env/staging` (critère « import staging sans écart pour les joueurs »).

---

## 5. Phase C : Catalogue (peut avancer en parallèle de D)

| PR | Contenu | Terminée quand |
|---|---|---|
| **C1** Back Catalogue | `Track` (renommer, désactiver, vérifier la preview, rang) ; Deezer découpé en ports, avec son faux dans `InSeconds.Api.Testing` ; preview à 3 états (piège 16) ; cache borné par la signature (piège 14), tailles d'entrées ; recherche publique nettoyée et dédupliquée ; routes admin du pool ; tâche `catalogue-refresh` et bouton « Re-vérifier les previews » via Hangfire | tests d'intégration verts |
| **C2** Import Catalogue | partie morceaux de l'import et de la vérification (preview, désactivation) | import staging sans écart |
| **C3** Front admin catalogue | onglet Pool, panneau de recherche, modales (écoute, renommage — permis pour le défi du jour avec avertissement, PR v1 #246 —, suppression), filtres (piège 28), écoute annulée à la fermeture (piège 42) | E2E du pool réactivés et verts |

**Fait en C1 :** projet `InSeconds.Deezer` (racine de `src/v2/back`, dans `InSeconds.slnx`, copié dans l'image de prod, aucune dépendance vers le reste), module `Catalogue` (`Domain`, `Application`, `Contracts`, `Persistence`), migration `Catalogue` (schéma `catalogue`, table `tracks`), les neuf routes, la tâche `catalogue-refresh`, le faux Deezer et le seed de l'hôte de test, le document OpenAPI `catalogue`. Détail : `src/v2/back/CLAUDE.md` (« Client Deezer », « Module Catalogue »). Décisions :
- **Ports par besoin** (§ 5.3) : `IPreviewProvider` (`PreviewLookup` : `Found` / `Missing` / `Unavailable`), `ITrackMetadataSource` (`TrackMetadataLookup`, avec le rang Deezer, et l'identifiant **demandé**, pas celui de la réponse) et `ITrackSearch` (`SearchLookup` : `Found` / `Unavailable`), implémentés par un seul `DeezerClient`. Le cache est un **décorateur** : `IPreviewProvider` est le décorateur (le jeu n'a besoin que de l'URL), `ITrackSearch` et `ITrackMetadataSource` sont le client brut, la recherche publique demande `CachedTrackSearch`. Le contrôle nocturne passe par `ITrackMetadataSource` : une requête par morceau donne l'extrait **et** le rang. Piège 16 (erreur Deezer en HTTP 200 : `Unavailable`, jamais « sans preview »), 13, 14 (TTL borné par la signature), 24 (`Size = 1` sur chaque entrée, cache dédié de 2000 entrées), 36 (jamais la requête dans les journaux) : un test nommé chacun.
- **`ITrackUsage` et `ITrackDirectory`** (`Catalogue/Contracts`) : Catalogue ne connaît pas Daily, qui dépendra de lui. `ITrackUsage` (`GetAsync(ids)` → `TrackUsage(LastUsedDate, UsageCount, UnlockDate, InTodayChallenge)` ; `GetTracksInCooldownAsync(jour)`) est **implémenté par Daily en E** ; en attendant, `NoTrackUsage` (« aucun usage », `TryAddScoped`). Daily enregistrera la sienne après `AddCatalogue`. `ITrackDirectory` (nom brut, titre affiché nettoyé, id Deezer, pochette, année) sert Gameplay et Daily ; l'accès à l'extrait du jeu sera ajouté au contrat en D. « Disponible » ou « utilisé » se déduit de `usageCount` : la liste du pool est **un tableau plat** (la v1 renvoyait `{ available, used }`).
- **Routes** (§ 5.6) : voir le CLAUDE.md du back. Écarts avec la v1, tous voulus : ajouter un identifiant déjà dans le pool répond **409 `catalogue.duplicate_deezer_id`** (la v1 renvoyait le morceau existant, sans erreur ; le front de C3 affiche le message) ; un identifiant inconnu de Deezer est un **422** `catalogue.not_found_on_deezer` (le plan disait « 422/404 », la v1 faisait 422) ; Deezer en panne ou quota dépassé est un **503 `catalogue.deezer_unavailable`** (code ajouté aux codes du § 5.6, la v1 faisait déjà 503) ; la suppression répond **204** ; `PUT /tracks/{id}` (actualiser) garde ses garde-fous (409 `catalogue.track_in_use`, 409 identifiant pris). **Renommer est permis à tout moment, défi du jour compris, sans aucun verrou** (PR v1 #246) : testé par « renommer un morceau du défi du jour en cours » (le morceau déclaré `inTodayChallenge` est renommé, la liste sert le nouveau nom, l'ancien n'existe plus). **L'effet sur les réponses des joueurs** (verdicts déjà enregistrés conservés, les suivantes corrigées, nom affiché changé pour tous) **viendra de Daily** : il se vérifiera en E avec ses tests.
- **Tâche `catalogue-refresh`** : `0 23 * * *`, **`Cron.Never()` en staging** (`appsettings.Staging.json`, `Jobs:catalogue-refresh:Cron`, testé), appelle la commande Wolverine `RefreshPreviews` (une ligne dans la tâche). Elle recontrôle l'extrait et le rang des morceaux non désactivés et non en cooldown **demain**, par lots de 10 espacés de 1,5 s (`Catalogue:Refresh:BatchSize` et `BatchDelay`, réglables pour les tests ; l'espacement passe par `Task.Delay(…, TimeProvider)`, testé avec une horloge simulée). Un résultat `Unavailable` ne change jamais l'état. **Le handler est `[NonTransactional]` et enregistre lot par lot** (`ICatalogueStore.SaveRefreshedAsync`, un `ExecuteUpdate` par morceau, sans `SaveChangesAsync`) : pour ~700 morceaux le contrôle dure plusieurs minutes, une transaction ouverte pendant les pauses retiendrait une connexion, et un seul enregistrement final perdrait tout si l'admin supprimait un morceau entre-temps ; un morceau supprimé est ignoré (non compté dans `updated`), les autres résultats sont gardés. Seuls l'état de l'extrait et le rang sont écrits. Compte rendu `{ checked, updated, failed }` (un dictionnaire : Hangfire n'écrit pas les propriétés à zéro). Ajout à l'infra Jobs de A2, par nécessité : **`IJobTrigger`** (le plan prévoyait que les boutons « passent par Hangfire », mais aucun mécanisme n'existait) : `TriggerAsync(idDeTâche)` renvoie l'identifiant de l'exécution, ou celui de l'exécution déjà en file ou en cours (un second clic la suit, au mieux : le test puis l'action ne sont pas atomiques, et une exécution en attente d'un nouvel essai n'est pas reconnue comme en cours) ; `JobExecutionResponse` (202, `Location`). « Générer le défi du jour » (E1) le réutilisera.
- **Domaine** : `Track` avec `Rename`, `Disable`/`Enable`, `RecordPreviewCheck`, `RecordRank`, `ReplaceDeezerSource`. **Écart de forme avec le ticket** : `RecordPreviewCheck` prend un `PreviewCheck { Available, Missing, Unavailable }` (le résultat d'un contrôle) et non un `PreviewStatus` : `Unavailable` n'est pas un état du morceau (`PreviewStatus` reste `Unknown` / `Available` / `Missing`, les valeurs stockées). `tracks.id` est tiré d'une **séquence HiLo** (`catalogue.tracks_hilo`), comme `device_sessions` : l'endpoint d'ajout met l'identifiant dans sa réponse, construite avant l'enregistrement par Wolverine. **C2 devra recaler cette séquence** après avoir copié les identifiants de la v1.
- **Hôte de test** : faux Deezer (`FakeDeezerHandler`, conventions de la v1 : id ≥ 9 000 000 000 sans extrait ; ajoutés ici, ≥ 8 000 000 000 inconnu de Deezer, ≥ 7 000 000 000 quota dépassé, tous deux en HTTP 200 comme le vrai) qui remplace le seul **transport HTTP** : le vrai client et le vrai cache tournent dessus. `FakeDeezerState` (requêtes reçues, `Intercept`) est remis à zéro par `/api/e2e/reset`, qui vide aussi le schéma `catalogue` (lu en base) et le cache. `POST /api/e2e/seed-catalogue` : le pool de test de la v1 (40 morceaux jouables, 5 sans extrait). **Le front v2 n'a pas encore `test-audio.mp3`** (l'extrait du faux pointe dessus) : à ajouter avec les E2E du pool, en C3.
- **OpenAPI** : second document `catalogue` (deux préfixes), `openapi/catalogue.json`, test « document à jour ». Le nettoyage des schémas garde désormais un entier nullable nullable (`releaseYear`, `rank`), sauf le `status` d'un `ProblemDetails` : le document des joueurs, déjà consommé par le front, ne change pas. Le client NSwag viendra en C3.
- **Trouvé en route** : les filtres de Hangfire sont une liste **globale** au processus ; `AddInSecondsJobs` ajoutait `JobTracingFilter` à chaque configuration, donc un de plus par API de test, jusqu'à un **dépassement de pile** du serveur de tâches (le processus de tests s'arrêtait) une fois les tests Catalogue ajoutés. Le filtre n'est plus ajouté qu'une fois (test dédié). Sans effet en prod (une API par processus). Les tests libèrent désormais les pools Npgsql de chaque API à sa destruction (`ApiFactory.DisposeAsync`, `ClearAllPools`) : le serveur de test garde ses 500 connexions (elles étaient atteintes avec une API neuve par test).
- **Revue de C1** : `ITrackUsage` est déclaré à `AlwaysUseServiceLocationFor` (Daily le remplacera sans régénérer le code de Catalogue) ; une annulation n'est relancée que si elle vient de l'appelant (le délai interne d'un `HttpClient` est un échec de Deezer) ; un morceau aux noms blancs est « introuvable » (422) ; une année avant 1 (« 0000-00-00 ») est ignorée ; la recherche, publique ou admin, renvoie une liste vide au-delà de 100 caractères (comme en dessous de 2) ; le texte d'une recherche n'apparaît dans aucun tag du span serveur (testé). Corrigé après la revue de la PR (audit/revue-pr-265-c1-2026-10-05.md) : la recherche admin répond **503 `catalogue.deezer_unavailable`** quand Deezer est en panne (le port distingue `Found` et `Unavailable`), la recherche publique reste vide dans ce cas ; l'identifiant Deezer enregistré à l'ajout et à l'actualisation est celui demandé (v1), plus le champ `id` de la réponse ; les extraits sont en priorité haute dans le cache partagé avec les recherches ; le verrou de `catalogue-refresh` attend 600 s (la tâche de nuit attend la fin d'un contrôle manuel au lieu d'échouer).
- **Laissé à la suite** : import des morceaux (C2), onglet Pool, modales et client NSwag du front (C3), accès à l'extrait du jeu dans le contrat (D), `ITrackUsage` réel et effet du renommage sur les réponses (E).
- **Tests** : **508 tests (Release), tous verts** après les correctifs de revue (309 avant, même décompte par projet : unitaires 121 → 234, architecture 8 → 12, intégration 164 → 246, import 16). Unitaires : `Track`, `CleanDisplayTitle`, déduplication, client Deezer (erreurs en 200, annulation propre à l'appelant, noms blancs, année 0, journaux), cache (TTL, tailles), commande `RefreshPreviews` sans base (lots et espacement prouvés par l'horloge simulée, enregistrement lot par lot, morceau supprimé). Intégration : recherche publique (plafond de longueur compris), pool admin dont « renommer un morceau du défi du jour en cours » et la course sur l'index unique, tâche appelée directement, morceau supprimé pendant le contrôle, bouton + suivi `GET /api/admin/jobs/{id}`, cron par défaut et `Never` en staging, document OpenAPI à jour, télémétrie de la recherche.

**Fait en C2 :** partie Catalogue de l'import (`deploy/migration-v2/10-import.sql` et `20-verify.sql`) et ses tests (`InSeconds.MigrationTests/CatalogueImportTests`, 24 cas, le vrai `run-import.sh` dans le conteneur PostgreSQL). Aucun changement d'API ni de migration. Décisions :
- **Repris** (§ 8.2) : `Tracks` → `catalogue.tracks`, **identifiants conservés** (un défi ou une réponse les référencera), noms, pochette, année (une année inférieure à 1, le « 0000-00-00 » de Deezer que la v1 enregistrait en 0, devient `NULL`, comme dans le client Deezer de la v2), dates de création et de modification. `HasPreview` → `preview_status` 1 (disponible) ou 2 (absent), jamais 0 : l'état « inconnu » n'existe pas en v1. `IsDisabled` → `disabled_at = COALESCE(UpdatedAt, now())` (la date de désactivation n'a jamais été conservée : la dernière modification, à défaut l'instant de l'import, jamais une date inventée plus ancienne). `deezer_rank`, `rank_updated_at` et `preview_checked_at` restent vides : la tâche `catalogue-refresh` les remplit la nuit suivante (jamais en staging, où elle est sur `Cron.Never()`).
- **Séquence recalée** : `catalogue.tracks_hilo` (HiLo par 10) est remise juste après le plus grand identifiant importé (`setval(max + 1, false)`, ou 1 si le pool est vide). Sans elle, le premier morceau ajouté en v2 prendrait l'identifiant d'un morceau de la v1 (conflit sur la clé primaire). Le script la **vérifie sans la consommer** (un `nextval` aurait avancé d'un lot) ; test : un morceau inséré avec le prochain identifiant ne rentre pas en conflit.
- **Pas repris** : `LastUsedDate` et `UsageCount` (§ 8.3), recalculés depuis les défis par Daily. **Leur vérification contre `challenge_tracks` (§ 8.5, « Cooldown ») vient avec l'import de Daily (E4)** : la table n'existe pas encore. De même, `DeezerRankSnapshot` est une colonne des défis.
- **Contrôles bloquants** (`20-verify.sql`) : nombre de morceaux et d'identifiants Deezer distincts ; chaque morceau repris champ par champ (identifiant, identifiant Deezer, noms, pochette, année, dates) ; état de l'extrait (correspondance `HasPreview`, rang et contrôle vides) ; ensemble des morceaux désactivés et leur date ; séquence. Pré-contrôle dans `10-import.sql` : une année au-delà de la plage de la colonne (`smallint`) est refusée **avec les identifiants des morceaux** (sinon l'insertion échouerait sans dire lequel). Rien de personnel dans les messages. Chaque contrôle est exercé par un test qui glisse un écart entre l'import et la vérification.
- **Rejouable** : `TRUNCATE catalogue.tracks` en tête de la partie ; un morceau ajouté ou renommé en v2 entre deux imports disparaît (testé). Quand Daily arrivera, ses tables seront vidées avant celle-ci (clés étrangères).
- **Tests** : 532 au total (508 après C1, + 24 d'import du Catalogue).
- **Docker** : les tests d'import ont besoin de Docker Desktop démarré (conteneur PostgreSQL), comme les tests d'intégration.

**Action de Clément après C2 :** une fois le merge déployé sur le staging, lancer « Copy prod DB to staging » depuis `env/staging` (**nouveau run**, pas un re-run) : critère « import staging sans écart ». Vérifier ensuite dans la base `inseconds_staging` que `SELECT count(*) FROM catalogue.tracks` égale `SELECT count(*) FROM public."Tracks"`.

**Fait en C3 :** domaine front `admin` (`src/v2/front/InSeconds.Client/src/app/admin/`, quatre couches) : coquille de l'admin, onglet Pool (`/admin/catalogue`), panneau de recherche, fenêtres d'écoute, de renommage et de suppression ; client NSwag du catalogue (`nswag/catalogue.nswag.json`) ; `admin.spec.ts` réactivé ; côté hôte de test, seed réaliste, usage simulé des morceaux, `reseed` et `login-as-admin`. Détail : `src/v2/front/CLAUDE.md` (« Domaine admin »). Décisions :
- **Route** : `/admin/catalogue` (§ 6.5 du plan). L'ancien `/admin/pool` et `/admin?tab=pool` y mènent (page de la grille gardée), tout comme `/admin` ; `?tab=dashboard|defis|joueurs|actions` mène à la page d'attente de l'onglet futur. La page de la grille vit dans `?page=` (à partir de 1), un rechargement la rouvre (v1, 29/09).
- **Coquille minimale** : l'accès (visiteur → « Connecte-toi d'abord », compte sans le rôle → « Accès refusé »), l'ID navigateur (`BrowserIdComponent` du domaine `account`, `admin` peut désormais l'importer), la déconnexion et l'onglet Pool. Le rôle vient de `GET /api/players/me` (`isAdmin`) et non de `GET /api/admin/me` : l'API revérifie de toute façon chaque requête, l'écran n'est qu'un confort. F2 ajoute les autres onglets.
- **Comportements de la v1 gardés** : filtre texte sur « artiste titre » collés (piège 28), recherche Deezer et filtre **liés** ou indépendants, ordre par défaut **disponibles avant utilisés** (désactivés toujours en fin), « Désactiver » à la place de la corbeille pour un morceau utilisé, grisé dans le défi du jour, renommage **toujours permis, défi du jour compris, avec avertissement** (PR v1 #246), écoute annulée à la fermeture (piège 42 : une réponse de Deezer qui arrive après la fermeture ne relance rien, testé), un seul son à la fois (le lecteur ne garde rien, piège 47).
- **Écarts avec la v1, voulus** : « Ajouter » d'un morceau déjà dans le pool répond **409** `catalogue.duplicate_deezer_id` (C1) : la ligne passe en « Erreur » et son infobulle donne la raison, l'avertissement du badge « déjà en pool » reste ; Deezer indisponible : message dédié (`catalogue.deezer_unavailable`) dans le panneau et dans la fenêtre d'écoute, distinct de « aucun résultat » ; un seul bouton « Fermer » dans la fenêtre d'écoute (celui du cadre). L'autonomie du pool utilise 5 morceaux par défi **en dur** (`DEFAULT_TRACKS_PER_CHALLENGE`) jusqu'à ce que le réglage vienne de l'API (F2 ou E).
- **`ModalService` gagne l'option `injector`** : le CDK Dialog résout les dépendances d'une fenêtre depuis la racine, une fenêtre du pool ne trouvait donc pas `PoolStore`. La page passe son propre injecteur (testé).
- **E2E** : un fichier se réactive entier, alors que `admin.spec.ts` mêle pool (C3) et onglets de F2 : les **titres restent ceux de la v1** (parité vérifiée), les tests du pool, de l'accès et de l'ID navigateur sont **actifs** (20), les 10 autres sont en `test.fixme` jusqu'à la PR qui livre leur écran (F2 : dashboard, défis, actions, joueurs, compteurs d'onglets ; E5 puis F2 : « le joueur qui vient de jouer… » et « l'icône d'un morceau… », qui jouent une partie puis ouvrent l'onglet Défis). **Le critère « liste des E2E désactivés vide » (J4) ne voit pas les `fixme`** : les chercher avant de le déclarer atteint. Écarts de scénario justifiés : « compte lié mais pas admin » se connecte par `linkAccount` (l'accueil du jeu n'existe pas avant E5) ; « visiteur non connecté » vise le lien de l'écran d'accès (l'en-tête propose aussi « Se connecter ») ; les deux tests d'adresse attendent `/admin/catalogue`.
- **Hôte de test** : seed de **55 morceaux réels** (ceux de la v1, dans le même ordre : 0-4 le défi d'avant-hier, 5-9 la veille, 10-14 le défi du jour, 15-20 cooldowns variés), `E2eTrackUsage` (usage simulé en mémoire, remplace `NoTrackUsage` : **à retirer quand Daily (E) fournira le vrai `ITrackUsage`**), `POST /api/e2e/reseed`, `POST /api/e2e/login-as-admin` (compte lié `admin-e2e@e2e.test`, promu en SQL). `test-audio.mp3` est copié dans `public/` du front (l'extrait du faux Deezer, annoncé en C1).
- **Tests** : **430 Vitest** (dont 158 pour le domaine `admin` : domaine, stores, lecteur, composants, fenêtres, page, coquille, routes), **540 tests back**, 20 E2E admin actifs et verts en local (+ les 12 de B5), parité v1/v2 : 107 / 107.

---

## 6. Phase D : Gameplay

| PR | Contenu | Terminée quand |
|---|---|---|
| **D1** Back Gameplay | `TrackRound`, `FuzzyAnswerMatcher`, indices, `ISeededShuffle` | tests unitaires verts (correction, indices, plancher d'écoute) |
| **D2** Front gameplay | machine à états d'une manche (`domain/`), `withTrackRound`, `AudioPort` sur Howler.js en Web Audio (décision du 01/10/2026, CORS Deezer vérifié le 02/10), comportements v1 gardés (pièges 33, 40, 44), saisie et autocomplete (clavier, effacement), révélation, graphique « en combien de temps » | tests Vitest de l'`AudioPort` verts dans un vrai Chromium (arrêt au palier, prolongation, relecture, erreur, autoplay unique) |

**Fait en D1 :** module back `Gameplay` (`InSeconds.Api/Modules/Gameplay/`) : `TrackRound`, `FuzzyAnswerMatcher`, les indices (`YearHint`, `HangmanArtistHint`, `HintPolicy`), `ISeededShuffle`. Aucune table, aucune route, aucun réglage, pas de migration, code Wolverine généré inchangé. Détail : `src/v2/back/CLAUDE.md` (« Module Gameplay »). Décisions :
- **Contrats et implémentations séparés** : tout ce qu'un mode utilise (`TrackRound`, `RoundOutcome`, `HintPolicy`, `IAnswerMatcher`, `IHintProvider`, `ISeededShuffle`) est dans `Contracts/` (un mode n'utilise d'un autre module que ses contrats), les implémentations sont dans `Domain/`. Testé : Gameplay n'a aucune dépendance vers l'accès aux données, le web ou l'infrastructure, ni vers Players ou Daily ; les noyaux ne dépendent pas de Gameplay.
- **La manche ne connaît ni le morceau ni les points** (§ 5.4) : `Resume(listenedSeconds, hintLevel)` la reconstitue depuis la session du mode (Daily range `current_listened_seconds` et `current_hint_level`, le verrou de position reste à Daily, piège 35). `RoundOutcome` renvoie la correction de l'artiste et du titre séparément, le palier annoncé et le niveau d'indice : le barème et la pénalité sont à `IDailyScoringPolicy` (E2).
- **Le plancher d'écoute est dans la manche** (il était dans le handler de `SubmitAnswer` en v1) : `Answer` refuse un palier annoncé inférieur au plus long palier écouté (`AnswerResult.BelowFloor`) ; Daily en fera le 400 `listened_duration_below_verified_minimum`.
- **Indices** : le refus distingue niveau inconnu et seuil non atteint (`HintRefusal`, avec la durée qui débloque), pour que Daily réponde 400 ou 409 comme en v1 (`hint_not_unlocked`). Cumul par `HintFacts.UpTo` : le niveau 2 rend aussi l'année. Les seuils d'une `HintPolicy` sont validés (positifs, croissants), ce que la v1 ne faisait pas : un réglage incohérent échouera au démarrage de Daily plutôt que de bloquer des indices en jeu.
- **Reprise à l'identique de la v1** : la correction (seuil `min(2, longueur ÷ 3)`, mots vides, parenthèses, accents), le motif du pendu, l'ordre du tirage pour une graine (testé contre la copie de l'algorithme de la v1, plus un ordre épinglé). **Constat gardé tel quel** : une référence qui se normalise en chaîne vide (« The The ») est égalée par toute saisie qui se normalise en chaîne vide (« !!! »). Rare et sans enjeu, mais noté.
- **Ce qui n'est pas dans D1** : la machine à états et l'`AudioPort` côté front (D2), le barème et la pénalité d'indice (`IDailyScoringPolicy`, E2), le `ITrackSelector` et le cooldown (E1), les routes (Daily).
- **Tests** : **676 tests back, tous verts** (dont 134 pour Gameplay, 14 d'architecture), build sans avertissement.

---

## 7. Phase E : Daily

| PR | Contenu | Terminée quand |
|---|---|---|
| **E1** Défi | défis, `ITrackSelector` (cooldown calculé), génération nocturne, à la volée (secours) et par le bouton admin via Hangfire ; pool insuffisant = exception, réessais toute la journée | tests d'intégration verts, dont course entre deux générations |
| **E2** Parties | démarrage, peek, reprise, expiration ; réponses, verrou du morceau (piège 35), écoute, indices, abandon ; fin sur le nombre réel de morceaux (piège 38) ; score ; **série et gels dans la même transaction** (piège 18, gels) ; gel offert à la conversion ; réponses jamais envoyées avant (piège 31) | tests d'intégration verts, dont partie de la veille terminée après minuit |
| **E3** Stats | stats du jour (morceaux cachés avant la fin de partie), répartition des scores ; photo figée J-2 (tâche `daily-close-day`), recalcul admin ; joueurs supprimés exclus ; stories hebdo | tests verts |
| **E4** Import Daily | défis, morceaux du défi, sessions (verrou joint sur le même défi), réponses, séries, stats figées de l'historique ; vérifications de scores, séries et cooldown | import staging sans écart |
| **E5** Front Daily | écrans (accueil, reprise, manche, récap, déjà joué, pas de défi, erreur), stores, toasts de série et de gels, gélule et panneau de série, partage, garde de sortie, synchro multi-onglets, gestion d'erreur de `stats/today` (piège 41) | **J3** : tous les E2E du jeu réactivés et verts |

---

## 8. Phase F : Admin

| PR | Contenu | Terminée quand |
|---|---|---|
| **F1** Back admin | dashboard, stats par défi, joueurs et historique, réglage du cooldown (rechargé à chaud) | tests d'intégration verts |
| **F2** Front admin | dashboard, défis (chips « toi », histogrammes, recalcul), joueurs, actions (boutons suivis par Hangfire, stories), heure de déploiement (piège 25), lien vers `/jobs` | **J4** : liste des E2E désactivés vide |

---

## 9. Phase G : préparation de la bascule

| PR | Contenu | Terminée quand |
|---|---|---|
| **G1** Import complet | import complet rejoué d'un bloc, contrôle de forme de la source, garde `import_state`/`--force`, stats figées de l'historique | import staging complet sans écart |
| **G2** Workflow « Bascule v2 » | `workflow_dispatch` : arrêt v1, import, vérification, clé Data Protection neuve (`--rotate-data-protection-key`, B4), démarrage v2 (mêmes noms de conteneurs), santé, et arrêt + redémarrage v1 au moindre écart ; anciennes routes en `410 common.new_version` ; déploiement auto sur `main` désactivé pour la v2 jusqu'à la bascule | testé sur le staging |
| **G3** CSP | CSP en `Report-Only` sur le staging, violations vers `/api/client-errors`, puis bloquante | une semaine sans violation sur le staging |
| **G4** Documentation | CLAUDE.md v2 (racine et sous-dossiers), README FR/EN, `docs/*`, pièges à jour | relue |

**Recette sur le staging** (§ 10.1 du plan détaillé) : copies prod fraîches, partie complète, reprise, série, gels, profil, appareils, admin, emails redirigés, iPhone et Android, installation PWA. **J5 : deux répétitions consécutives de la bascule sans intervention manuelle.**

**Actions de Clément avant la mise en prod :**
- ~~certificat Data Protection de prod~~ fait le 30/09 (`~/apps/InSeconds/secrets/dataprotection.pfx`), mot de passe à mettre dans `.env.prod` au moment de la bascule ;
- ~~`cloudflare-only.sh` appliqué (S17)~~ fait le 30/09 ; Cloudflare Access sur `api.inseconds.cc/jobs` (S3) ;
- contrôles healthchecks.io pour les quatre tâches Hangfire ;
- choix du créneau (hors 22 h 30 – 1 h UTC).

---

## 10. Phase H : mise en prod

| Quand | Action |
|---|---|
| La veille | copie prod fraîche sur le staging et dernière répétition ; `--migrate-only` en prod (crée les schémas v2, sans effet sur la v1) ; image v2 prête |
| Jour J | merge `env/staging` → `main` sans déploiement automatique, puis workflow « Bascule v2 » ; contrôles rapides (cookie existant, partie en cours, partie complète, admin, email) |
| Première nuit | surveillance des tâches de 23 h, 0 h et 0 h 05, et de Grafana |

Le retour arrière reste possible tant que personne n'a joué en v2 (§ 10.3 du plan détaillé).

---

## 11. Phase I : après la mise en prod

| Quand | PR ou action |
|---|---|
| J+1, bascule validée | `AuthToken` v1 vidé (S7) |
| Quelques semaines | **I1** : sauvegarde archivée puis suppression des tables v1 de `public` ; suppression des routes en `410` |
| Dans la foulée | **I2** : suppression de `src/back`, `src/front` et des jobs CI v1 ; déplacement de `src/v2` dans `src` ; chemins CI, Docker, Dependabot et Sonar mis à jour, dont le retrait de l'exclusion de duplication SonarCloud `src/front/**, src/back/**` (posée dans l'UI pour la PR A4, #244) ; flux Git normal rétabli |
| J+90 | **I3** : retrait du middleware de transition et de `legacy_tokens` ; suppression des anciennes clés Data Protection non chiffrées |
| Ensuite | mode Runs, dans son fil |

---

## 12. Suivi

- **Tickets GitHub (30/09)** : ticket parent #205 « Refonte v2 : suivi du chantier », un sous-ticket par étape (A1 #206 … I3 #237, recette G5 #233, mise en prod H #234), étiquette `refonte-v2`. Les tickets font référence pour l'avancement ; le statut de chaque jalon est aussi donné dans ce fil.
- À chaque PR : tests ajoutés, revue de code, doc v2 à jour, avertissements Sonar traités (règles habituelles).
- Chaque correctif v1 fait pendant le chantier est noté pour être reporté en v2.
