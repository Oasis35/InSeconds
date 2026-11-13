# Décisions d'architecture et de produit

Les choix déjà faits, avec leur raison, pour ne pas les rediscuter ni les réimplémenter par erreur. Une nouvelle décision s'ajoute ici avec sa date ; l'histoire du projet est dans [`historique/`](../historique/).

## Produit

- **Un classement général par niveau, sur choix, et des classements de groupes entre amis** : les stats globales du jeu du jour restent anonymes. Le classement général du mode Setlist (proto 4, #563) classe par **niveau** (la moyenne des parties récentes), jamais par meilleur score (un score obtenu avec Shazam y pèse peu) ; **personne n'y figure sans l'avoir choisi** (interrupteur éteint par défaut, comptes seulement), on n'en lit que les 20 premiers puis sa place et ses deux voisins, et celui qui n'y figure pas ne reçoit qu'une position par dizaines (« top 30 % »). Ce qui change (proto 4, #560) : un compte crée un groupe de 15 joueurs au plus et invite par un lien, et un classement durable entre les pseudos des membres, visible des seuls membres (un non-membre reçoit un 404, jamais un pseudo), existe dans le module `Social`. Raison : un classement entre amis donne une raison de revenir sans exposer personne à des inconnus ; le groupe est un cercle fermé, quitté ou supprimé à volonté, et l'effacement d'un compte retire le joueur de ses groupes. Social ne connaît aucun mode : la performance de chaque mode arrive par un contrat que le mode implémente (`IMemberPerformanceSource`). Un classement anonyme du jour reste envisageable.
- **Pas de mot de passe** : lien magique uniquement, et le jeu reste 100 % jouable en invité ; un compte optionnel garde série et historique entre appareils. La logique « trouver le compte par l'email, sinon le créer sur l'invité du navigateur » (`AccountSignIn`) est indépendante du moyen de vérification : un futur Google OAuth n'aura qu'à l'appeler.
- **Droits RGPD en libre-service** (16/10/2026) : copie des données et suppression du compte depuis le profil (identité prouvée par la connexion, rien par email ni par Brevo), même code que la purge des comptes inactifs et que les commandes de secours. Un compte supprimé l'est pour de bon (plus de `deleted_at`). Durées de conservation dans la tâche de purge existante plutôt qu'une tâche de plus. Détail : [`conformite/rgpd.md`](../conformite/rgpd.md).
- **Usage de Deezer strictement non commercial** : ni publicité, ni revenu, ni partenaire, aucun audio ni image stockés. Détail : [`conformite/conditions-api-deezer.md`](../conformite/conditions-api-deezer.md).

## Back

- **Monolithe modulaire, pas de microservices** (29/09/2026) : une API, une base, des modules (Players, Catalogue, Gameplay, Daily) séparés par leurs contrats, vérifiés par les tests d'architecture ; un mode de jeu ne voit jamais un autre mode. Détail : [`contrats-entre-modules.md`](contrats-entre-modules.md).
- **Wolverine** (29/09/2026) pour les endpoints (Wolverine.Http), les transactions automatiques et l'outbox PostgreSQL ; codegen statique. **Pas de RabbitMQ** : l'outbox suffit.
- **PostgreSQL définitif**, un schéma par module, noms en **snake_case**.
- **Un store par module** nommé par l'intention (`IDailyStore`…), **pas de repository générique**.
- **Hangfire** (30/09/2026) pour les tâches planifiées : stockage PostgreSQL, tableau de bord `/jobs` réservé aux admins, cron dans la configuration, déclenche des commandes Wolverine. TickerQ écarté (trop jeune).
- **Authentification par le cookie standard d'ASP.NET Core** (30/09/2026), avec validation de l'appareil en base, plutôt qu'un schéma maison.
- **Clés Data Protection chiffrées par un certificat** (30/09/2026), certificat hors de la base et sauvegardé à part.
- **Stats d'un jour terminé figées** (J-2), recalculables à la main depuis l'admin ; la veille et le jour même calculés en direct.
- **Forme d'onde calculée par l'API et stockée en base** (02/11/2026, #474) : la forme (2 Ko de chiffres par morceau, pas d'audio) est calculée par une étape de `catalogue-refresh` et, pour un ajout manuel, par un message Wolverine différé de 15 min, sous un seul verrou ; le navigateur ne calcule qu'en repli. Un job horaire et un second job nocturne écartés (pièces en plus, mêmes appels Deezer). Zone grise des conditions assumée ([conformité Deezer](../conformite/conditions-api-deezer.md)).
- **Autocomplétion Deezer par l'API** (`GET /api/catalogue/search`) : l'API Deezer refuse les appels CORS du navigateur.
- **Sauvegarde de la base hors de l'API** (timer systemd du VPS) : elle doit tourner même quand l'application est en panne. Surveillance des tâches et de la sauvegarde par healthchecks.io (14/10/2026, Grafana jugé trop pénible à régler).
- **`/jobs` sans Cloudflare Access** (prod le 14/10/2026, staging le 19/10/2026) : la policy Admin de l'API suffit (401 anonyme, 403 joueur). Au staging, Access ne protège que le front (`dev.inseconds.cc`) ; jamais `api-dev` (les appels du front ne suivent pas la redirection de connexion).

## Exploitation

- **Livraison en deux temps** : PR vers `env/staging`, validée sur `dev.inseconds.cc`, puis PR `env/staging` → `main` en **merge commit** (jamais squash : les anciens squash donnaient des conflits au merge suivant). Un correctif urgent peut viser `main`, qui est ensuite remergée dans `env/staging`.
- **Grafana Cloud pour la prod seulement** (17/10/2026) : le staging n'envoie aucune télémétrie ; trois tableaux (Exploitation, Un joueur, Activité) dans [`deploy/grafana/`](../../deploy/grafana/README.md).
- **Emails par Brevo** (expéditeur `compte@inseconds.cc`, suivi des clics désactivé), Resend abandonné.

## Front

- **NgRx SignalStore** (30/09/2026) ; NgRx Store classique écarté.
- **Domaines calqués sur les modules du back**, frontières vérifiées par Sheriff.
- **Son sur un simple élément audio HTML** : Howler.js essayé puis retiré après la recette sur iPhone (#309).
- **GSAP pour les animations des écrans de jeu** (Clément, 27/10/2026, codé le 03/11 pour Setlist) : version épinglée, importé par la seule façade `ui/motion/motion.ts`, coupé en mouvement réduit ; les animations simples restent en CSS.
- **Setlist s'enchaîne seul** (Clément, 03/11/2026) : 2 s après une réponse, le morceau suivant démarre sans clic (exception à « le son ne démarre que sur un clic », l'élément audio ayant déjà joué dans un geste du joueur) ; coupé en mouvement réduit, où « Morceau suivant » attend le clic. À recetter sur iPhone, avec le tic du chrono (Web Audio) qui joue à côté de l'élément audio.

## Principes

- **Bibliothèques éprouvées plutôt que du code maison** (NgRx SignalStore, CDK Dialog, Hangfire…), même si l'architecture doit s'y adapter. Exception assumée : le son.
- **Une information à un seul endroit** dans la doc : une copie parallèle finit toujours par dériver du code.
- **Mobile first** : toute proposition d'écran se pense d'abord pour un téléphone.

## Mode Runs (livré, sur invitation)

Le module `Runs` (schéma `runs`) et le domaine front `runs/` sont livrés (proto 1, 27/10/2026) : un mode s'adapte à l'architecture, pas l'inverse. Un mode n'importe jamais l'autre (Daily et Runs ne se voient pas), Players et Catalogue ne connaissent d'un mode que ses contrats (`IPlayerDataContributor`, `ITrackUsage`), et l'accès est sur invitation (`runs.access`, distinct du rôle admin). Conçu le 17/10/2026 (nom affiché provisoire « Setlist ») : règles, écrans, conception et plan dans [`runs/`](../runs/README.md).

Deux choix du proto 4 (13/11/2026) :
- **Le Hit « premier groupe » se calcule dans le front** : `GET /api/runs/hits` rend les 16 Hits du mode, le front y ajoute celui des groupes d'après `GET /api/social/groups` (`withGroupHit`). Runs ne voit pas Social (Social reçoit la performance de chaque mode, jamais l'inverse) : faire calculer ce Hit par Runs demanderait un contrat de Social vers les modes, pour une seule case.
- **La navigation par mois de l'historique est écrite deux fois** (`DailyHistory` et `RunHistory`, mois voisins qui ont une partie) : Daily et Runs ne se voient pas, et dix lignes ne valent pas un contrat commun.
