# Infra partagée du VPS — Postgres

Stack **indépendante** du cycle de vie de n'importe quel projet applicatif (InSeconds ou un
futur projet) : une seule instance Postgres 17, une base + un utilisateur dédiés par projet.
Se déploie une fois sur le VPS, tourne en permanence.

## Premier déploiement

```bash
cd ~/infra   # ou l'emplacement choisi sur le VPS
cp .env.example .env
# éditer .env : POSTGRES_SUPERUSER_PASSWORD + INSECONDS_DB_PASSWORD
docker compose up -d
```

Au tout premier démarrage (volume vide), `init/01-inseconds.sh` crée automatiquement la base
`inseconds` + l'utilisateur `inseconds`. Ces scripts `docker-entrypoint-initdb.d/*.sh` ne
s'exécutent **qu'une seule fois** (volume Postgres vide) — un `docker compose restart` ne les
rejoue pas.

Le réseau Docker `shared-postgres` est créé par ce stack (déclaré `name: shared-postgres`,
pas `external`). Les stacks applicatifs (ex. `docker-compose.prod.yml` d'InSeconds) le
déclarent en `external: true` pour le rejoindre.

Aucun port n'est publié sur l'hôte : Postgres n'est joignable que depuis les conteneurs
connectés au réseau `shared-postgres`.

## Ajouter un futur projet

Le script d'init ne tourne qu'au premier boot, donc pour un nouveau projet ajouté après coup,
créer sa base/utilisateur manuellement (pas de redémarrage nécessaire) :

```bash
docker exec -it shared-postgres psql -U postgres -c "CREATE USER <projet> WITH PASSWORD '<mdp>';"
docker exec -it shared-postgres psql -U postgres -c "CREATE DATABASE <projet> OWNER <projet>;"
```

## Supprimer la base d'un projet

```bash
docker exec -it shared-postgres psql -U postgres -c "DROP DATABASE <projet>;"
docker exec -it shared-postgres psql -U postgres -c "DROP USER <projet>;"
```

Le conteneur Postgres continue de tourner pour les autres projets. Pour redéployer ensuite,
recréer la base/user (commandes ci-dessus) puis relancer le stack applicatif — les migrations
EF Core (`db.Database.Migrate()` au boot de l'API) recréent le schéma automatiquement.

## Backup

À mettre en place (cf. étape 7 du plan de migration VPS) : dump quotidien externalisé hors
VPS, pas seulement local (le VPS est un single point of failure).
