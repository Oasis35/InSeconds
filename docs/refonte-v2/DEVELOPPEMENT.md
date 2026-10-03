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
| **B5** Front account | `/account/login`, `verify`, profil, appareils, confirmation d'email ; `BrowserId` ; header avec avatar et série (vide jusqu'à Daily) | **J2** : E2E login, profil, changement d'email réactivés et verts |

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
- révocation (déconnexion, un appareil, les autres) : `revoked_at` et retrait du cache de validation, refusée dès la requête suivante ; déconnecter un appareil ne touche pas les autres (piège 39) ; l'appareil d'un autre joueur répond 404 comme un inconnu ;
- routes de compte (pseudo, changement d'email) : 403 `players.guest_forbidden` pour un invité ; appareils et déconnexion ouverts à tout joueur identifié ;
- `user_agent_label` sans langue (« Chrome · Android » plutôt que « Chrome sur Android ») : le front l'affiche tel quel dans les deux langues ;
- purge : tous les jetons expirés, des deux usages (consommés compris), chaque nuit.

---

## 5. Phase C : Catalogue (peut avancer en parallèle de D)

| PR | Contenu | Terminée quand |
|---|---|---|
| **C1** Back Catalogue | `Track` (renommer, désactiver, vérifier la preview, rang) ; Deezer découpé en ports, avec son faux dans `InSeconds.Api.Testing` ; preview à 3 états (piège 16) ; cache borné par la signature (piège 14), tailles d'entrées ; recherche publique nettoyée et dédupliquée ; routes admin du pool ; tâche `catalogue-refresh` et bouton « Re-vérifier les previews » via Hangfire | tests d'intégration verts |
| **C2** Import Catalogue | partie morceaux de l'import et de la vérification (preview, désactivation) | import staging sans écart |
| **C3** Front admin catalogue | onglet Pool, panneau de recherche, modales (écoute, renommage — permis pour le défi du jour avec avertissement, PR v1 #246 —, suppression), filtres (piège 28), écoute annulée à la fermeture (piège 42) | E2E du pool réactivés et verts |

---

## 6. Phase D : Gameplay

| PR | Contenu | Terminée quand |
|---|---|---|
| **D1** Back Gameplay | `TrackRound`, `FuzzyAnswerMatcher`, indices, `ISeededShuffle` | tests unitaires verts (correction, indices, plancher d'écoute) |
| **D2** Front gameplay | machine à états d'une manche (`domain/`), `withTrackRound`, `AudioPort` sur Howler.js en Web Audio (décision du 01/10/2026, CORS Deezer vérifié le 02/10), comportements v1 gardés (pièges 33, 40, 44), saisie et autocomplete (clavier, effacement), révélation, graphique « en combien de temps » | tests Vitest de l'`AudioPort` verts dans un vrai Chromium (arrêt au palier, prolongation, relecture, erreur, autoplay unique) |

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
| **G2** Workflow « Bascule v2 » | `workflow_dispatch` : arrêt v1, import, vérification, démarrage v2 (mêmes noms de conteneurs), santé, et arrêt + redémarrage v1 au moindre écart ; anciennes routes en `410 common.new_version` ; déploiement auto sur `main` désactivé pour la v2 jusqu'à la bascule | testé sur le staging |
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
