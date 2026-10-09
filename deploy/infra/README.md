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

### Base du staging InSeconds

Même principe pour l'environnement de staging (`docker-compose.staging.yml`, cf. CLAUDE.md
racine § Staging) — mot de passe à reporter dans `~/apps/InSeconds-staging/.env.staging`
(`INSECONDS_STAGING_DB_PASSWORD`) :

```bash
docker exec -it shared-postgres psql -U postgres -c "CREATE USER inseconds_staging WITH PASSWORD '<mdp>';"
docker exec -it shared-postgres psql -U postgres -c "CREATE DATABASE inseconds_staging OWNER inseconds_staging;"
```

## Supprimer la base d'un projet

```bash
docker exec -it shared-postgres psql -U postgres -c "DROP DATABASE <projet>;"
docker exec -it shared-postgres psql -U postgres -c "DROP USER <projet>;"
```

Le conteneur Postgres continue de tourner pour les autres projets. Pour redéployer ensuite,
recréer la base/user (commandes ci-dessus) puis relancer le stack applicatif — les migrations
EF Core (`db.Database.Migrate()` au boot de l'API) recréent le schéma automatiquement.

## Sauvegardes

`backup.sh` sauvegarde la base de prod `inseconds` en entier (tous les schémas : les tables v1
de `public` comme ceux de la v2). Le staging n'est pas sauvegardé : il se reconstruit depuis la
prod (`deploy/vps/copy-prod-db-to-staging.sh`).

Une sauvegarde :

1. `pg_dump -Fc` dans un conteneur `postgres:17-alpine` jetable (même version majeure que
   `shared-postgres`), avec le compte `inseconds` ;
2. vérifie le fichier (`pg_restore --list` lisible et au moins une table avec données) ;
3. le garde dans `~/backups/postgres/` (dossier `700`) et supprime les fichiers de plus de 7 jours ;
4. si R2 est configuré, l'envoie **chiffré** (rclone crypt, conteneur `rclone/rclone`) dans
   `daily/` du bucket `inseconds-backups`, plus une copie dans `monthly/` pour la première du
   mois ; supprime sur R2 les quotidiennes de plus de 30 jours et les mensuelles de plus de 365 ;
5. si `HEALTHCHECK_URL` est renseignée, pingue healthchecks.io (`/start`, puis succès ou `/fail`).

Le dump ne passe jamais par GitHub : il reste sur le VPS puis part vers R2.

### Quand elle tourne

- **Chaque nuit à 3 h UTC** par le workflow `.github/workflows/db-backup.yml` (« Backup prod DB »),
  qui se connecte en SSH au VPS (mêmes secrets que le déploiement) et y lance le script. Un échec
  envoie le mail habituel de GitHub Actions.
- **À la main**, quand on veut : onglet Actions → « Backup prod DB » → *Run workflow*, ou sur le VPS :

  ```bash
  cd ~/apps/InSeconds/deploy/infra && ./backup.sh
  ```

  À faire avant toute opération risquée sur la base (import, bascule, suppression de tables).

GitHub peut retarder ou sauter un job planifié quand il est très chargé : healthchecks.io prévient
si une nuit passe sans sauvegarde réussie.

### Mise en place (une fois, sur le VPS)

Ajouter à `deploy/infra/.env` (cf. `.env.example`) :

```bash
# Clé R2 « inseconds-backups-vps » (Object Read & Write sur le seul bucket) : dans KeePass
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
# Adresse « S3 API » de la page du bucket, SANS /inseconds-backups à la fin
R2_ENDPOINT=https://<id-compte>.eu.r2.cloudflarestorage.com
# Phrase de passe du chiffrement : la générer, puis la ranger dans KeePass
BACKUP_ENCRYPTION_PASSWORD=...
# Facultatif : URL de ping du check healthchecks.io « inseconds-backup » (période 1 j, tolérance 2 h)
HEALTHCHECK_URL=https://hc-ping.com/...
```

Pour générer la phrase de passe : `openssl rand -base64 32`. **Sans elle, les sauvegardes de R2
sont illisibles** : elle doit être dans KeePass, pas seulement sur le VPS (un VPS perdu
l'emporterait avec lui).

Puis lancer une première sauvegarde et un test de restauration :

```bash
cd ~/apps/InSeconds/deploy/infra
chmod 600 .env
./backup.sh
./backup.sh list-remote
./backup.sh restore-test
```

Sans les variables R2, `backup.sh` fait seulement la sauvegarde locale. Les renseigner à moitié
est une erreur (le script s'arrête).

### Restaurer

`./backup.sh restore-test [fichier]` restaure un dump (le plus récent par défaut) dans une base
jetable `inseconds_restore_test`, affiche le nombre de lignes par table, puis la supprime. La base
de prod n'est jamais touchée. À refaire de temps en temps : une sauvegarde jamais restaurée ne
prouve rien.

Pour reprendre une sauvegarde de R2 (VPS perdu, ou besoin d'une date plus ancienne) :

```bash
./backup.sh list-remote
./backup.sh fetch monthly/inseconds-2026-10-01T030000Z.dump   # déchiffrée dans ~/backups/postgres/
./backup.sh restore-test ~/backups/postgres/inseconds-2026-10-01T030000Z.dump
```

Sur un VPS neuf, il suffit de Docker, du dépôt et d'un `deploy/infra/.env` contenant les
variables R2 et la phrase de passe (depuis KeePass).

Remplacer réellement la base de prod est une opération manuelle, API arrêtée, avec la commande
de CLAUDE.md racine § « Restaurer un dump PostgreSQL » (`pg_restore --clean --if-exists`).
