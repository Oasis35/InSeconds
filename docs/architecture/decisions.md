# Décisions d'architecture et de produit

Les choix déjà faits, avec leur raison, pour ne pas les rediscuter ni les réimplémenter par erreur. Une nouvelle décision s'ajoute ici, avec sa raison ; l'histoire du projet est dans [`historique/`](../historique/README.md).

## Produit

- **Pas de classement public du défi du jour** : ses statistiques restent anonymes (médiane, égaliseur, histogrammes, rien sous 5 joueurs). Raison : on joue en invité, sans rien exposer à des inconnus.
- **Les groupes entre amis sont ouverts à tout compte, avec ou sans l'accès Survie** (19/11/2026, #643) : leur classement par défaut est celui du Défi du jour (« Cette semaine », 7 jours glissants, et « Aujourd'hui », fermé tant que le joueur n'a pas fini son défi), le même pour tous : l'écran d'un groupe ne montre plus de classement Survie, seule la place du joueur par niveau reste sur la carte Survie et à la fin d'une partie de Survie (décision du 19/11/2026, #646). Raison : sans Survie, l'app n'avait rien de social qui donne envie de revenir ; un groupe reste privé, il n'expose personne à des inconnus, donc la règle précédente tient.
- **La Survie a des classements, d'une autre nature** :
  - **groupes entre amis** (module `Social`) : un compte crée un groupe de 15 joueurs au plus et invite par un lien ; le classement entre les pseudos des membres n'est visible que des membres (un non-membre reçoit un 404, jamais un pseudo). Un classement entre amis donne une raison de revenir sans exposer personne à des inconnus ; le groupe se quitte ou se supprime à volonté, et l'effacement d'un compte retire le joueur de ses groupes ;
  - **classement général par niveau**, jamais par meilleur score (un score obtenu avec Shazam y pèse peu) : le niveau suit 80 % de l'ancien niveau et 20 % du score de chaque série, un disque de plus au plus par série, et baisse avec l'inactivité ;
  - y figurent **tous les comptes autorisés par l'admin** (ligne `runs.access`) qui ont fini une partie : jamais un invité, **jamais un admin**, même avec sa ligne d'accès ; base légale : intérêt légitime, avec information à la création du compte et dans `/privacy` ;
  - chacun y apparaît sous son **pseudo** (le défaut) ou un **alias musical unique** (le droit d'opposition) ; on n'en lit que les 20 premiers, puis sa place et ses deux voisins.
- **Pas de mot de passe** : lien magique uniquement, et le jeu reste 100 % jouable en invité ; un compte optionnel garde série et historique entre appareils. La logique « trouver le compte par l'email, sinon le créer sur l'invité du navigateur » (`AccountSignIn`) est indépendante du moyen de vérification : un futur Google OAuth n'aura qu'à l'appeler.
- **Droits RGPD en libre-service** : copie des données et suppression du compte depuis le profil (identité prouvée par la connexion, rien par email ni par Brevo), même code que la purge des comptes inactifs et que les commandes de secours. Un compte supprimé l'est pour de bon (pas de suppression logique). Durées de conservation dans la tâche de purge existante plutôt qu'une tâche de plus. Détail : [`conformite/rgpd.md`](../conformite/rgpd.md).
- **Usage de Deezer strictement non commercial** : ni publicité, ni revenu, ni partenaire, aucun audio ni image stockés. Détail : [`conformite/conditions-api-deezer.md`](../conformite/conditions-api-deezer.md).

## Back

- **Monolithe modulaire, pas de microservices** : une API, une base, des modules (Players, Catalogue, Gameplay, Daily, Runs, Social) séparés par leurs contrats, vérifiés par les tests d'architecture ; un mode de jeu ne voit jamais un autre mode. Détail : [`contrats-entre-modules.md`](contrats-entre-modules.md).
- **Un noyau ne connaît aucun mode** : Players, Catalogue et Social déclarent dans leurs propres `Contracts` ce qu'ils attendent des modes (`IPlayerDataContributor`, `ITrackUsage`, `IMemberPerformanceSource`, `IMemberScoreSource`), et chaque mode l'implémente. Le seul contrat d'un mode vu par un noyau est `Daily.Contracts.IStreakGrants` (le gel offert à la création d'un compte), exception nommée vérifiée par les tests.
- **Social est un noyau, nourri par contrat** : les groupes et le classement ne connaissent ni Daily ni Runs ; la performance de chaque mode arrive par `IMemberPerformanceSource` (la Survie), ses scores du jour et de la semaine par `IMemberScoreSource` (le Défi du jour), et un nouveau mode s'y ajoute sans toucher à Social. **Un classement par mode, jamais une moyenne des modes** (19/11/2026, #643) : le Défi et la Survie ne se comparent pas. Daily et Runs ne voient de Social que ces contrats.
- **Wolverine** pour les endpoints (Wolverine.Http), les transactions automatiques et l'outbox PostgreSQL ; codegen statique. **Pas de RabbitMQ** : l'outbox suffit.
- **PostgreSQL définitif**, un schéma par module, noms en **snake_case**.
- **Un store par module** nommé par l'intention (`IDailyStore`…), **pas de repository générique**.
- **Hangfire** pour les tâches planifiées : stockage PostgreSQL, tableau de bord `/jobs` réservé aux admins, cron dans la configuration, déclenche des commandes Wolverine. TickerQ écarté (trop jeune).
- **Authentification par le cookie standard d'ASP.NET Core**, avec validation de l'appareil en base, plutôt qu'un schéma maison.
- **Clés Data Protection chiffrées par un certificat**, certificat hors de la base et sauvegardé à part.
- **Stats d'un jour terminé figées** (J-2), recalculables à la main depuis l'admin ; la veille et le jour même calculés en direct.
- **Forme d'onde calculée par l'API et stockée en base** : la forme (2 Ko de chiffres par morceau, pas d'audio) est calculée par une étape de `catalogue-refresh` et, pour un ajout manuel, par un message Wolverine différé de 15 min, sous un seul verrou ; le navigateur ne calcule qu'en repli. Un job horaire et un second job nocturne écartés (pièces en plus, mêmes appels Deezer). Zone grise des conditions assumée ([conformité Deezer](../conformite/conditions-api-deezer.md)).
- **Autocomplétion Deezer par l'API** (`GET /api/catalogue/search`) : l'API Deezer refuse les appels CORS du navigateur.
- **Sauvegarde de la base hors de l'API** (timer systemd du VPS) : elle doit tourner même quand l'application est en panne. Surveillance des tâches et de la sauvegarde par healthchecks.io plutôt que par une alerte Grafana.

## Exploitation

- **Livraison en deux temps** : PR vers `env/staging`, validée sur `dev.inseconds.cc`, puis PR `env/staging` → `main` en **merge commit** (jamais squash : il crée des conflits au merge suivant). Un correctif urgent peut viser `main`, qui est ensuite remergée dans `env/staging`.
- **`/jobs` sans Cloudflare Access**, en prod comme au staging : la policy Admin de l'API suffit (401 anonyme, 403 joueur). Au staging, Access ne protège que le front (`dev.inseconds.cc`), jamais `api-dev` (les appels du front ne suivent pas la redirection de connexion).
- **Page de rebond GitHub Pages retirée** (`oasis35.github.io/InSeconds`) : ne pas la recréer, le domaine `inseconds.cc` suffit.
- **Grafana Cloud pour la prod seulement** : le staging n'envoie aucune télémétrie ; trois tableaux (Exploitation, Un joueur, Activité) dans [`deploy/grafana/`](../../deploy/grafana/README.md).
- **Emails par Brevo** (expéditeur `compte@inseconds.cc`, suivi des clics désactivé), Resend abandonné.

## Front

- **NgRx SignalStore** ; NgRx Store classique écarté.
- **Domaines calqués sur les modules du back**, frontières vérifiées par Sheriff.
- **Son sur un simple élément audio HTML** : Howler.js essayé puis retiré après la recette sur iPhone.
- **GSAP pour les animations des écrans de jeu** : version épinglée, importé par la seule façade `ui/motion/motion.ts`, coupé en mouvement réduit ; les animations simples restent en CSS.
- **La Survie s'enchaîne seule** : 2 s après une réponse, le morceau suivant démarre sans clic (exception à « le son ne démarre que sur un clic », l'élément audio ayant déjà joué dans un geste du joueur) ; coupé en mouvement réduit, où « Morceau suivant » attend le clic. À recetter sur iPhone, avec le tic du chrono (Web Audio) qui joue à côté de l'élément audio.

## Principes

- **Bibliothèques éprouvées plutôt que du code maison** (NgRx SignalStore, CDK Dialog, Hangfire…), même si l'architecture doit s'y adapter. Exception assumée : le son.
- **Une information à un seul endroit** dans la doc : une copie parallèle finit toujours par dériver du code.
- **Mobile first** : toute proposition d'écran se pense d'abord pour un téléphone.

## La Survie (module `Runs`, livré sur invitation)

Le module `Runs` (schéma `runs`) et le domaine front `runs/` sont livrés : un mode s'adapte à l'architecture, pas l'inverse. Un mode n'importe jamais l'autre (Daily et Runs ne se voient pas), Runs utilise les noyaux par leurs contrats et implémente les leurs (`IPlayerDataContributor`, `ITrackUsage`, `IMemberPerformanceSource`), et l'accès est sur invitation (`runs.access`, distinct du rôle admin). Règles, écrans, conception et plan dans [`runs/`](../runs/README.md).

- **Le Hit « premier groupe » se calcule dans le front** : `GET /api/runs/hits` rend les Hits du mode, le front y ajoute celui des groupes d'après `GET /api/social/groups` (`withGroupHit`). Runs ne voit pas Social (Social reçoit la performance de chaque mode, jamais l'inverse) : faire calculer ce Hit par Runs demanderait un contrat de Social vers les modes, pour une seule case.
- **La navigation par mois de l'historique est écrite deux fois** (`DailyHistory` et `RunHistory`, mois voisins qui ont une partie) : Daily et Runs ne se voient pas, et dix lignes ne valent pas un contrat commun.
