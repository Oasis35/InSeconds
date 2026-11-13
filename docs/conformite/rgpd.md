# RGPD : ce qui est en place

État au 13/11/2026, après la passe RGPD du 16/10/2026 (PR #351, #349, #352), la partie du mode Run (#363), la source d'arrivée (#445) et le proto 4 de Setlist (groupes, niveau, classement général, Hits). Le texte public est la page `/privacy` (traductions `privacy.*` de `public/i18n/fr.json` et `en.json`), les mentions légales (éditeur, hébergeur, Deezer) sont sur `/legal` (`legal.*`) : toute évolution du traitement des données doit y être reportée.

## Accès aux données

- **Admin réservé** : toute route `/api/admin*` reçoit la policy Admin d'office, `/jobs` aussi ; le rôle est relu en base (cache d'une minute) et posé uniquement en SQL (piège 5). `SecurityTests` vérifie le 401/403 de toutes les routes admin.
- **Minimisation dans l'admin** : aucune réponse saisie, aucun appareil, aucune IP, aucun invité nominatif ; tableau de bord en agrégats. L'onglet Joueurs masque l'email (affiché au clic). Le pseudo est joint à la lecture et disparaît avec le joueur. `/privacy` dit ce que l'éditeur voit d'un compte (pseudo, email, série, 30 derniers jours). **Modération** : l'admin voit le nom de chaque groupe, son nombre de membres et le pseudo de son créateur (jamais le code d'invitation ni la liste des membres), peut renommer ou supprimer un groupe et remettre à zéro un nom de groupe ou un pseudo inapproprié ; ces actions ne journalisent que des identifiants (groupe, joueur, admin), jamais un nom ni un pseudo.
- **Aucun export de l'admin** : seul le joueur peut obtenir une copie de ses données.
- **API en `Cache-Control: no-store`**.

## Journaux

Jamais d'email, de pseudo, de réponse saisie, de cookie ni d'`Authorization` (testé) : la recherche Deezer ne journalise que sa longueur (piège 36), les emails que leur sujet, les erreurs du front perdent query string et fragment, l'appareil est un libellé grossier (« Safari · iPhone »). **Codes de lien masqués** : le code d'invitation d'un groupe et le code d'une playlist (un secret de lien : le lire suffit à rejoindre) sont remplacés par `{code}` dans le chemin du span serveur (`url.path`, `SecretPaths` de `InSeconds.Infrastructure`, préfixes dans `LinkSecrets` de l'API), dans le chemin de la requête joint à chaque log (`RequestPath`, `SecretPathScopeProvider`), dans les adresses complètes comme dans les chemins, dans le chemin des erreurs et des rapports CSP remontés par le front (`maskLinkCodes` côté navigateur, `LinkSecrets` côté API) ; tests `SecretPathsTests`, `SocialGroupTests.Invitation_LeCodeNEntrePasDansLaTrace`, `link-path.spec.ts`.

**Compteurs du mode Setlist** (`RunsMetrics`) et des groupes (`SocialMetrics`) : parties, difficultés, cartes, groupes créés ou rejoints, choix d'apparaître au classement général, comptés sans identifiant de joueur ni de groupe (seules étiquettes : un nom d'événement, de difficulté, de carte ou de disque), exportés vers Grafana en prod seulement. Détail : `CLAUDE.md` § Ce que fait l'application (Observabilité).

## Mesure d'audience

Cloudflare Web Analytics, en injection automatique sur le site `inseconds.cc` (réglage du tableau de bord Cloudflare, rien dans le code) : sans cookie ni identifiant, statistiques agrégées seulement (visites, pages vues, pays, référents, appareils, vitesse). Pas de bandeau de consentement. Décrit dans `/privacy` (« Données collectées », « Cookie », « Destinataires ») ; son script est dans la CSP (`static.cloudflareinsights.com` en `script-src` et `connect-src`, `nginx/csp.conf.template`), ses mesures partent vers le même domaine (`/cdn-cgi/rum`). Google Analytics a été écarté le 24/10/2026 : il imposerait un bandeau de consentement et enverrait les données chez Google.

Panneau technique de l'admin : lecture anonyme de l'API publique de GitHub (`api.github.com`, état de la CI et dernier commit des branches déployées) depuis le navigateur de l'admin, sans cookie ni jeton (`connect-src` de la CSP). GitHub voit l'IP de l'admin ; aucun joueur n'est concerné, `/privacy` n'en parle donc pas.

**Source d'arrivée d'un invité** (#445) : à l'ouverture, le front lit le `utm_source` du lien, sinon le **domaine seul** du référent (jamais l'adresse complète), le garde le temps de la visite dans `sessionStorage` et l'envoie à la création de l'invité. Le serveur ne garde qu'une valeur au format strict (minuscules, lettres, chiffres, `.` `-` `_`, 40 caractères au plus, `other` sinon, `direct` sans source) dans `players.players.acquisition_source` : rattachée à l'identifiant pseudonyme, dans la copie des données, effacée avec le joueur. Le compteur Grafana (`inseconds_players_guests_created_total`) n'a que la source en étiquette, jamais le joueur. L'admin n'en voit que des comptes par source (invités arrivés un jour donné et sur 30 jours, Accueil de l'admin), jamais la source d'un joueur ; un jour à un seul nouvel invité, croisé avec les joueurs du jour, peut relier un identifiant pseudonyme à un domaine d'origine : assumé, l'admin voyant déjà ces identifiants et la source n'étant qu'un domaine. Base légale : intérêt légitime (mesure d'audience), décrite dans `/privacy` (« Données collectées »).

## Droits du joueur

- **Copie** : `GET /api/players/me/export` (JSON : source d'arrivée, compte, appareils, puis une section par mode de jeu sous `modules` : `modules.daily` pour la série et les parties, `modules.runs` pour les parties (réponses, difficulté de chaque manche, coups de pouce), les playlists créées, le record et l'accès, `modules.social` pour les groupes), bouton « Tes données » du profil.
- **Effacement** : `POST /api/players/me/delete` (pseudo retapé pour confirmer), effacement réel (`AccountErasure`, qui appelle l'`IPlayerDataContributor` de chaque mode de jeu dans la même transaction).
- **Sans connexion possible** : commandes de secours sur le VPS `--export-player` / `--delete-player` (cf. `src/back/CLAUDE.md` § Démarrage), réponse sous un mois, uniquement à l'adresse du compte.

## Mode Run (Setlist)

- **Données gardées** (schéma `runs`) : les parties (statut, manches passées, score, dates), le résultat de chaque morceau (artiste et titre trouvés ou non, points, morceau neutralisé) et la difficulté choisie pour chaque manche (avec l'heure du choix ; rien n'est noté pour une manche jouée sans choix), les coups de pouce reçus, lâchés ou joués (carte, palier, morceau, heures), **jamais le texte saisi** ; le record (meilleur score, meilleur disque) ; le niveau (`runs.player_levels` : points, nombre de parties comptées, scores des 50 dernières parties finies au plus, ce que la dernière a changé), montré au joueur seul ; les playlists lancées et leur auteur ; les défis d'amis reçus (`runs.received_challenges` : quelle playlist un compte a ouverte par le lien d'un autre joueur, quand, et s'il l'a refusée ; conservée jusqu'à la suppression de la playlist ou du compte, sans purge à 7 jours : la ligne ne dit que quelle playlist un compte a ouverte et garde son refus, et un rappel refusé ne doit pas revenir ; elle sort dans l'export ; le rappel de l'accueil montre au compte le pseudo de l'auteur et son total, seulement si l'auteur a fini la playlist) ; l'accès accordé par l'admin.
- **Pseudo d'invité** : un invité donne un pseudo (20 caractères au plus, texte libre, `players.players.guest_pseudo`) à la fin de sa première partie sur la playlist d'un ami. Rattaché à son identifiant pseudonyme (donc à son navigateur), obligatoire pour voir la comparaison, modifiable, jamais celui d'un compte, vidé s'il crée un compte (le pseudo du compte prend le relais). Montré aux autres joueurs de la playlist (comparaison, auteur, fantôme) avec, en cas d'homonymes, une marque dérivée de l'identifiant du joueur (jamais du cookie) ; cité dans le texte de partage d'un duel gagné, que le joueur envoie lui-même. Dans l'export et effacé avec le joueur (`PlayerData`, `AccountErasure`), jamais dans les journaux ni la télémétrie, vidé par l'anonymisation du staging. Vidé 91 jours après la dernière visite de l'invité (`PurgeStaleGuestPseudos`, étape de `players-purge-expired-tokens`, la durée des appareils). La priorité des comptes sur les pseudos vaut à l'écriture du pseudo d'invité ; un compte créé ou renommé ensuite au même pseudo ne le déloge pas, la marque d'homonymes distingue alors les deux dans la comparaison (pas pour l'auteur ni le fantôme). Invisible de l'admin (`GetPseudosAsync` ne lit que les comptes).
- **Invitation dans un groupe** : le lien d'une invitation ouvert sans compte laisse dans le navigateur le code d'invitation du groupe (`localStorage`, clé `inseconds.pendingGroupInvite`), pour le proposer après la connexion ; ni identifiant ni pseudo, rien n'est envoyé au serveur avant « Rejoindre », et il est retiré une fois le groupe rejoint. Le classement d'un groupe montre à ses membres le pseudo, le disque et les points de niveau de chacun (`/privacy`).
- **Visibilité** : une playlist se partage par son lien (code de 6 caractères). Qui l'ouvre voit le pseudo de son auteur (celui de son compte, sinon son pseudo d'invité, sinon « Invité » à l'écran, y compris pour un compte effacé) ; pendant sa partie, le **fantôme** de l'auteur s'il a fini la playlist (son total après chaque morceau, donc ses points morceau par morceau, seulement jusqu'au dernier morceau répondu, #504 ; « Invité » pour un auteur invité ; un auteur dont le compte est effacé n'a plus de fantôme, ses parties étant supprimées) ; après sa propre partie, la comparaison montre le pseudo, le disque et le score de chaque joueur de la playlist. Pas de classement public, pas de nombre de joueurs sur le lien. La page `/privacy` le dit (§ Données collectées).
- **Effacement** : `RunsPlayerData` supprime les parties (avec leurs réponses, la difficulté de chaque manche et les coups de pouce, par cascade), le record, le niveau et l'accès du joueur ; les playlists qu'il a lancées restent jouables, `created_by` passe à `null`.
- **Énumération des liens** : la lecture d'un lien est limitée à 60 requêtes par IP en 5 minutes (`run-link`), pour 31⁶ codes possibles.

## Groupes entre amis (Social)

- **Données gardées** (schéma `social`) : le groupe (nom de 40 caractères au plus, texte libre limité aux caractères d'un pseudo, code d'invitation, créateur, date) et ses membres (identifiant du joueur, date d'arrivée). Un groupe exige un compte : jamais un invité. Aucun message, aucune adresse, aucun score propre au groupe : le classement est calculé à chaque lecture depuis les parties du mode de jeu (cf. `Social.Contracts.IMemberPerformanceSource`).
- **Visibilité** : seuls les membres voient le détail d'un groupe, les pseudos des autres membres et le classement ; un non-membre reçoit un 404 (jamais un pseudo, jamais l'existence du groupe). L'aperçu d'une invitation, ouvert à qui a le lien, ne montre que le nom du groupe et le nombre de places. Le code d'invitation est un secret de lien (8 caractères, 31⁸ possibilités) que le créateur peut renouveler ; la lecture d'un lien est limitée à 60 requêtes par IP en 5 minutes (`social-invitation`).
- **Classement général** : la table `social.ranking_visibility` garde une ligne (identifiant du joueur, date du choix) pour chaque compte qui a **choisi** d'apparaître au classement général ; aucune ligne par défaut. Tant que la ligne existe, son pseudo, son disque et ses points de niveau sont visibles de tout joueur identifié (les 20 premiers, et les voisins de chacun) ; il la retire quand il veut par le même interrupteur. Un joueur qui n'y figure pas ne lit que sa position par dizaines.
- **Hits** : calculés à la lecture sur les parties finies du joueur (`GET /api/runs/hits`), rien n'est stocké côté serveur ; le navigateur garde la liste des noms de Hits déjà montrés (`localStorage`, clé `inseconds.hits.seen`), sans identifiant.
- **Copie** : section `modules.social` de l'export (nom, rôle, dates, nombre de membres de chaque groupe, et la date depuis laquelle il apparaît au classement général ; jamais le pseudo d'un autre membre, ni le code d'invitation).
- **Effacement** : `SocialPlayerData` retire le joueur de ses groupes et son choix d'apparaître au classement général ; s'il en était le créateur, le plus ancien membre restant le devient, et le groupe disparaît quand il était le dernier. Rien du joueur ne reste dans `social`.
- **Conservation** : tant que le compte existe (comme les autres données de jeu) ; la purge des comptes inactifs passe par le même effacement. Au staging, les noms de groupe sont remplacés et les codes renouvelés (`staging-anonymize.sql`).
- **Journaux** : seulement des identifiants (groupe, joueur), jamais un nom de groupe ni un pseudo.

## Sauvegardes

Base de prod sauvegardée chaque nuit, chiffrée vers Cloudflare R2 (30 jours, une par mois sur un an, archives sans limite ; `deploy/infra/README.md`). Le contrôle de restauration (`backup-verify.sh`) déchiffre la dernière sauvegarde dans un dossier du VPS réservé à son utilisateur, la restaure dans un Postgres jetable sans réseau, la compare à la prod, puis supprime la copie et le conteneur (ceux d'un passage tué sont supprimés au passage suivant). Ce qui sort de ces passages (`infra.backup_runs`, signal healthchecks.io, journal Grafana) ne contient aucune donnée de joueur : noms de fichiers, nombres de lignes, étape et message d'erreur, les erreurs de `pg_restore` étant filtrées avant envoi (aucune ligne `DETAIL`, `CONTEXT` ni valeur citée, testé par `BackupScriptsTests`). `infra.backup_runs` garde 90 jours et est vidée au staging.

## Durées de conservation

Appliquées chaque nuit par `players-purge-expired-tokens` :

| Donnée | Durée |
|---|---|
| Jetons de connexion et de changement d'email | jusqu'à expiration |
| Appareil (même déconnecté) | 91 jours après sa dernière visite (un jour après l'expiration du cookie) |
| Compte sans visite | 3 ans, puis effacé avec son historique (jamais un admin, sans email de prévenance) |
| Invité | jamais effacé ; son pseudo d'invité est vidé 91 jours après sa dernière visite, il est ensuite anonyme une fois ses appareils supprimés |
| Playlist d'un run | sans limite, comme les défis du jour ; sans auteur une fois son compte effacé |
| Texte tapé par le joueur | jamais stocké (seule la correction est gardée) |

## Staging

Copie de la prod anonymisée (`deploy/vps/staging-anonymize.sql`) : emails et pseudos remplacés, rôle admin retiré sauf `STAGING_KEEP_EMAIL`, emails sortants redirigés (cf. [`exploitation/deploiement.md`](../exploitation/deploiement.md#staging-devinsecondscc--api-devinsecondscc)).

Le texte saisi déjà stocké a été supprimé par migration ; `VACUUM FULL daily.answers` a récupéré sa place en prod le 19/10/2026.

## Reste ouvert

- **Pas de trace des actions de l'admin** (qui a consulté ou modifié quoi). Un seul admin aujourd'hui : à reconsidérer s'il y en a un deuxième.
