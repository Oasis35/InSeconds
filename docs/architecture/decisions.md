# Décisions d'architecture et de produit

Les choix déjà faits, avec leur raison, pour ne pas les rediscuter ni les réimplémenter par erreur. Une nouvelle décision s'ajoute ici avec sa date ; le récit de la refonte de 2026 est dans [`historique/refonte-2026/`](../historique/refonte-2026/).

## Produit

- **Pas de leaderboard permanent** : stats globales seulement, pas de classement inter-jours (les pseudos existent avec les comptes, mais ne servent pas à classer). Un classement anonyme du jour reste envisageable.
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
- **Autocomplétion Deezer par l'API** (`GET /api/catalogue/search`) : l'API Deezer refuse les appels CORS du navigateur.
- **Sauvegarde de la base hors de l'API** (timer systemd du VPS) : elle doit tourner même quand l'application est en panne. Surveillance des tâches et de la sauvegarde par healthchecks.io (14/10/2026, Grafana jugé trop pénible à régler).

## Front

- **NgRx SignalStore** (30/09/2026) ; NgRx Store classique écarté.
- **Domaines calqués sur les modules du back**, frontières vérifiées par Sheriff.
- **Son sur un simple élément audio HTML** : Howler.js essayé pendant la refonte puis retiré après la recette sur iPhone (#309).

## Principes

- **Bibliothèques éprouvées plutôt que du code maison** (NgRx SignalStore, CDK Dialog, Hangfire…), même si l'architecture doit s'y adapter. Exception assumée : le son.
- **Une information à un seul endroit** dans la doc : une copie parallèle finit toujours par dériver du code.
- **Mobile first** : toute proposition d'écran se pense d'abord pour un téléphone.

## Mode Runs (à venir)

L'architecture lui réserve un module et un domaine front ; **rien n'est créé avant sa construction** (ni schéma, ni table vide, ni code). Il s'adapte à l'architecture, pas l'inverse. Conçu le 17/10/2026 (nom affiché provisoire « Platines ») : règles, écrans, conception et plan dans [`runs/`](../runs/README.md).
