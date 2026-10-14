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
5. envoie à Grafana Cloud une ligne de log « Sauvegarde OK » (ou « Sauvegarde en échec »), avec
   la configuration OTLP de l'API (cf. [Surveillance](#surveillance-alerte-grafana)) ;
6. envoie un signal à healthchecks.io (contrôle `inseconds-backup`, `/fail` en cas d'échec), avec la
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

Les signaux vers Grafana et healthchecks.io n'ont rien à configurer ici : le script lit
`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` et `HEALTHCHECKS_PING_KEY` dans
`~/apps/InSeconds/.env.prod` (ceux de l'API). Pour les surcharger, les mettre dans `deploy/infra/.env`.

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

### Surveillance (alerte Grafana)

Chaque passage envoie à Grafana Cloud un log du service `inseconds-backup` : « Sauvegarde OK »
(avec le nom du dump, sa taille et `backup.offsite` = envoyé sur R2 ou non) ou « Sauvegarde en
échec ». Une alerte prévient si **aucun « Sauvegarde OK » n'est arrivé en 26 h**, ce qui couvre
l'échec, le VPS éteint et le timer arrêté. À créer une fois dans Grafana
(*Alerting → Alert rules → New alert rule*) :

- source de données : la source Loki des logs (`grafanacloud-…-logs`) ;
- requête (*Code*) :

  ```logql
  sum(count_over_time({service_name="inseconds-backup"} |= "Sauvegarde OK" [26h]))
  ```

- condition : *IS BELOW* `1` ;
- *Configure no data and error handling* → *Alert state if no data* : **Alerting** (sans aucun
  log, la requête ne renvoie rien, ce qui doit aussi déclencher l'alerte) ;
- évaluation toutes les heures (*pending period* `0s`), point de contact : le mail du compte.

Pour vérifier que le signal arrive : lancer `./backup.sh`, puis dans *Explore* (source Loki)
`{service_name="inseconds-backup"}`. Un message « Signal Grafana impossible. » dans la sortie du
script veut dire que l'envoi a échoué (la sauvegarde, elle, n'est pas affectée).

### Surveillance (healthchecks.io)

Choisi le 14/10/2026 pour les tâches planifiées de l'API v2 (#315) : un service fait pour ça, hors du
VPS, réglé en quelques clics. La sauvegarde envoie le même signal, pour tout voir au même endroit ;
l'alerte Grafana ci-dessus peut rester en plus ou être supprimée.

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

Un lancement depuis `/jobs` (« Déclencher maintenant ») envoie aussi son signal. Le staging n'envoie
rien (pas de clé dans `.env.staging`) : il ne doit jamais toucher aux contrôles de la prod.

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
