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

### Contenu de la base `inseconds`

Une seule base pour la v1 et la v2 : les tables v1 vivent dans `public` (jusqu'à leur
suppression, PR I1) ; la v2 y ajoute un schéma par module (`players`, `catalogue`, `daily`),
plus `infra` (réglages, clés Data Protection), `messaging` (outbox Wolverine), `jobs`
(Hangfire) et `extensions` (`citext`). Les migrations de l'API créent ces schémas : rien à
faire à la main (détail : `CLAUDE.md` racine § Modèle de données). L'utilisateur `inseconds`
étant propriétaire de la base, il peut les créer.

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
EF Core (appliquées au démarrage de l'API) recréent les schémas automatiquement.

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
5. envoie un signal à healthchecks.io (contrôle `inseconds-backup`, `/fail` en cas d'échec), avec la
   clé de ping de l'API (cf. [healthchecks.io](#surveillance-healthchecksio)).

### Quand elle tourne

- **Chaque nuit à 3 h UTC** par le timer systemd `inseconds-backup.timer` du VPS
  (`systemd/inseconds-backup.service` + `.timer`). `Persistent=true` : si le VPS était éteint à
  3 h, la sauvegarde part à son redémarrage. Le service lance le script du checkout de prod
  (`~/apps/InSeconds/deploy/infra/backup.sh`), remis à jour à chaque déploiement.
- **À la main**, quand on veut, sur le VPS :

  ```bash
  sudo systemctl start inseconds-backup        # comme la nuit (journal dans journalctl)
  cd ~/apps/InSeconds/deploy/infra && ./backup.sh   # ou directement, sortie à l'écran
  ```

  À faire avant toute opération risquée sur la base (import, bascule, suppression de tables).

Suivi : `systemctl list-timers inseconds-backup` (prochain passage),
`journalctl -u inseconds-backup -n 50` (sortie des derniers passages).

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
```

Le signal vers healthchecks.io n'a rien à configurer ici : le script lit `HEALTHCHECKS_PING_KEY` dans
`~/apps/InSeconds/.env.prod` (celle de l'API). Pour la surcharger, la mettre dans `deploy/infra/.env`.

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

Puis installer le timer :

```bash
sudo cp ~/apps/InSeconds/deploy/infra/systemd/inseconds-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now inseconds-backup.timer
systemctl list-timers inseconds-backup   # prochain passage : 3 h UTC
```

Les fichiers sont **copiés** (pas des liens) : après une modification de l'un d'eux dans le
dépôt, refaire le `cp` et le `daemon-reload`. Le service tourne sous l'utilisateur `debian`, qui
doit pouvoir lancer `docker` (comme pour le déploiement).

Sans les variables R2, `backup.sh` fait seulement la sauvegarde locale. Les renseigner à moitié
est une erreur (le script s'arrête).

### Surveillance (healthchecks.io)

Choisi le 14/10/2026 (#315) pour la sauvegarde et les tâches planifiées de l'API v2 : un service fait
pour ça, hors du VPS, réglé en quelques clics. Il remplace l'alerte Grafana « aucun Sauvegarde OK en
26 h » d'avant (le script n'envoie plus rien à Grafana) : un échec, un VPS éteint ou un timer arrêté
se voient tous comme un signal manquant ou un `/fail`.

**Qui envoie quoi.** Après chaque passage, un `POST` vers
`https://hc-ping.com/<clé de ping>/<contrôle>` en cas de réussite, `…/<contrôle>/fail` en cas
d'échec (alerte immédiate). Le contrôle est créé au premier signal (`?create=1`) :

| Contrôle | Envoyé par | Heure (UTC) |
|---|---|---|
| `daily-generate-challenge` | API v2, tâche Hangfire | 0 h 00 (un nouvel essai toutes les 10 min si le pool manque : chaque essai raté envoie `/fail`) |
| `daily-close-day` | API v2, tâche Hangfire | 0 h 05 |
| `catalogue-refresh` | API v2, tâche Hangfire | 23 h 00 |
| `players-purge-expired-tokens` | API v2, tâche Hangfire | 3 h 30 |
| `inseconds-backup` | `backup.sh` (timer systemd) | 3 h 00 |

Un lancement depuis `/jobs` (« Déclencher maintenant ») envoie aussi son signal.

**Staging.** Il a son propre projet healthchecks.io, « [Dev]InSeconds », avec sa propre clé de ping dans
`~/apps/InSeconds-staging/.env.staging` (`HEALTHCHECKS_PING_KEY`, cf. `.env.staging.example`). Les contrôles y portent
les mêmes noms, mais une clé ne touche que les contrôles de son projet : le staging ne peut pas fausser ceux de la prod,
à condition de ne **jamais** y mettre la clé de prod. Il sert à vérifier les signaux avant la mise en prod ; pas d'alerte
Signal sur ce projet (redéploiements fréquents, `catalogue-refresh` en pause). Pas de sauvegarde en staging, donc pas de
contrôle `inseconds-backup`.

**Mise en place (une fois) :**

1. Créer un compte sur healthchecks.io (offre gratuite : 20 contrôles), puis un projet `InSeconds`.
2. *Settings* du projet → *Ping key* → *Create*. La copier dans `~/apps/InSeconds/.env.prod`
   (`HEALTHCHECKS_PING_KEY=…`, cf. `.env.prod.example`) et dans KeePass.
3. Redéployer l'API (ou attendre le prochain déploiement), puis lancer `./backup.sh` : le contrôle
   `inseconds-backup` apparaît. Les tâches apparaissent à leur premier passage (ou en les lançant
   depuis `/jobs`).
4. Pour chaque contrôle créé : les réglages par défaut (*Period* 1 jour, *Grace* 1 heure) conviennent,
   toutes ces tâches tournant une fois par jour. Pour une heure d'alerte plus juste, passer le
   contrôle en *Cron* avec l'heure du tableau (fuseau `UTC`).
5. *Integrations* : l'email du compte est branché par défaut (Telegram possible aussi).

La clé de ping est secrète (elle permet d'envoyer des signaux) : l'API ne la journalise jamais, et
`backup.sh` la passe à `curl` par l'entrée standard (absente de `ps`). Un healthchecks.io injoignable
ne fait jamais échouer une tâche : l'API écrit « Signal healthchecks.io de la tâche … impossible » en
avertissement, `backup.sh` « Signal healthchecks.io impossible. ».

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
