# Infra partagée du VPS - Postgres

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
s'exécutent **qu'une seule fois** (volume Postgres vide) - un `docker compose restart` ne les
rejoue pas.

Le réseau Docker `shared-postgres` est créé par ce stack (déclaré `name: shared-postgres`,
pas `external`). Les stacks applicatifs (ex. `docker-compose.prod.yml` d'InSeconds) le
déclarent en `external: true` pour le rejoindre.

Aucun port n'est publié sur l'hôte : Postgres n'est joignable que depuis les conteneurs
connectés au réseau `shared-postgres`.

### Contenu de la base `inseconds`

Un schéma par module de l'API (`players`, `catalogue`, `daily`),
plus `infra` (réglages, clés Data Protection), `messaging` (outbox Wolverine), `jobs`
(Hangfire) et `extensions` (`citext`). Les migrations de l'API créent ces schémas : rien à
faire à la main (détail : `CLAUDE.md` racine § Modèle de données). L'utilisateur `inseconds`
étant propriétaire de la base, il peut les créer. `public` est vide.

## Ajouter un futur projet

Le script d'init ne tourne qu'au premier boot, donc pour un nouveau projet ajouté après coup,
créer sa base/utilisateur manuellement (pas de redémarrage nécessaire) :

```bash
docker exec -it shared-postgres psql -U postgres -c "CREATE USER <projet> WITH PASSWORD '<mdp>';"
docker exec -it shared-postgres psql -U postgres -c "CREATE DATABASE <projet> OWNER <projet>;"
```

### Base du staging InSeconds

Même principe pour l'environnement de staging (`docker-compose.staging.yml`, cf.
`docs/exploitation/deploiement.md` § Staging) - mot de passe à reporter dans `~/apps/InSeconds-staging/.env.staging`
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
recréer la base/user (commandes ci-dessus) puis relancer le stack applicatif - les migrations
EF Core (appliquées au démarrage de l'API) recréent les schémas automatiquement.

## Sauvegardes

`backup.sh` sauvegarde la base de prod `inseconds` en entier (tous les schémas), `backup-verify.sh` contrôle chaque nuit qu'elle se
restaure (cf. [Contrôle de restauration](#contrôle-de-restauration)) ; leur code commun est dans `backup-common.sh`. Le staging n'est ni
sauvegardé ni contrôlé : il se reconstruit depuis la prod (`deploy/vps/copy-prod-db-to-staging.sh`), et les deux scripts refusent de tourner
depuis son checkout (`~/apps/InSeconds-staging`, ou un dossier qui a un `.env.staging`), sans rien envoyer.

**Compte rendu de chaque passage** (sauvegarde, archive ou contrôle, réussi ou non) :

- une ligne dans `infra.backup_runs` (type, début, fin, résultat, étape et message court d'un échec, dump, taille, envoi vers R2), que le
  panneau technique de l'admin affiche ; les lignes de plus de 90 jours sont supprimées par les scripts (`BACKUP_RUNS_KEEP_DAYS`) ; si
  l'écriture échoue, le passage n'en est pas affecté (message dans le journal) ;
- un signal à healthchecks.io pour la nuit (cf. [Surveillance](#surveillance-healthchecksio)) : en échec, l'étape, le message et la fin du
  journal sont joints au signal, et se lisent dans l'email d'alerte ;
- des logs vers Grafana (service `inseconds-backup`, avec la configuration OTLP de l'API) : en échec, tout le journal du passage, une ligne
  par ligne ; en réussite, une seule ligne de résumé (« Sauvegarde OK : … », « Restauration OK : … »). Panneaux « Sauvegardes et contrôle de
  restauration » du tableau Exploitation. Pas d'alerte Grafana : l'alerte, c'est healthchecks.io.

Les erreurs de `pg_restore` sont filtrées avant d'entrer dans le journal : seules restent ses lignes `pg_restore: …`, coupées après la raison
d'un `ERROR:` (jamais les lignes `DETAIL`, `CONTEXT` ni `Command was`, qui citent le contenu des tables). Un passage arrêté par un signal
(`systemctl stop`, délai de l'unité dépassé) envoie quand même son compte rendu ; tué net, son Postgres jetable et sa copie déchiffrée sont
supprimés par le passage suivant. Une sauvegarde lancée pendant une autre s'arrête sur le verrou, sans compte rendu ni signal d'échec.

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

  À faire avant toute opération risquée sur la base (restauration, suppression de tables).

### Sauvegarde archivée

`./backup.sh archive` fait la même sauvegarde (dump, vérification, copie locale), puis l'envoie
chiffrée dans `archive/` sur R2, **qu'aucune rotation ne supprime**. R2 est obligatoire : sans lui,
la commande échoue. Pas de signal healthchecks.io (ce n'est pas la sauvegarde de la nuit). À lancer à la main avant toute suppression définitive de données. Une archive se supprime à la main, jamais par
le script.

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

Puis lancer une première sauvegarde et un test de restauration (le contrôle automatique de la nuit est à installer ensuite, cf. [Contrôle de
restauration](#contrôle-de-restauration)) :

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

Choisi le 14/10/2026 (#315) pour la sauvegarde et les tâches planifiées de l'API : un service fait
pour ça, hors du VPS, réglé en quelques clics. Il remplace l'alerte Grafana « aucun Sauvegarde OK en
26 h » d'avant (le script n'envoie plus rien à Grafana) : un échec, un VPS éteint ou un timer arrêté
se voient tous comme un signal manquant ou un `/fail`.

**Qui envoie quoi.** Après chaque passage, un `POST` vers
`https://hc-ping.com/<clé de ping>/<contrôle>` en cas de réussite, `…/<contrôle>/fail` en cas
d'échec (alerte immédiate). Le contrôle est créé au premier signal (`?create=1`) :

| Contrôle | Envoyé par | Heure (UTC) |
|---|---|---|
| `daily-generate-challenge` | API, tâche Hangfire | 0 h 00 (un nouvel essai toutes les 10 min si le pool manque : chaque essai raté envoie `/fail`) |
| `daily-close-day` | API, tâche Hangfire | 0 h 05 |
| `catalogue-refresh` | API, tâche Hangfire | 23 h 00 |
| `players-purge-expired-tokens` | API, tâche Hangfire (jetons, appareils, comptes inactifs) | 3 h 30 |
| `inseconds-backup` | `backup.sh` (timer systemd) | 3 h 00 |
| `inseconds-backup-restore` | `backup-verify.sh` (timer systemd), contrôle de restauration | 4 h 00 |

Un lancement depuis `/jobs` (« Déclencher maintenant ») envoie aussi son signal.

**Staging.** Il a son propre projet healthchecks.io, « [Dev]InSeconds », avec sa propre clé de ping dans
`~/apps/InSeconds-staging/.env.staging` (`HEALTHCHECKS_PING_KEY`, cf. `.env.staging.example`). Les contrôles y portent
les mêmes noms, mais une clé ne touche que les contrôles de son projet : le staging ne peut pas fausser ceux de la prod,
à condition de ne **jamais** y mettre la clé de prod. Il sert à vérifier les signaux avant une mise en prod ; pas d'alerte
Signal sur ce projet (redéploiements fréquents, `catalogue-refresh` en pause). Pas de sauvegarde en staging, donc ni
`inseconds-backup` ni `inseconds-backup-restore`.

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
ne fait jamais échouer une tâche ni un script : l'API écrit « Signal healthchecks.io de la tâche … impossible » en
avertissement, `backup.sh` « Signal healthchecks.io impossible. ».

### Contrôle de restauration

Une sauvegarde jamais restaurée ne prouve rien : `backup-verify.sh` restaure chaque nuit la dernière sauvegarde **telle qu'elle est sur R2**,
en cinq étapes (chaque ligne du journal et chaque message d'échec les nomment, ex. `étape 4/5 contenu : …`) :

1. **fraîcheur** : la dernière sauvegarde de `daily/` a moins de 26 h (`BACKUP_VERIFY_MAX_AGE_HOURS`), et le mois en cours a sa copie dans
   `monthly/` ;
2. **téléchargement** : elle est récupérée de R2 et déchiffrée (la copie distante est lisible, la phrase de passe est la bonne), puis
   vérifiée par `pg_restore --list` ;
3. **restauration** : complète (`--exit-on-error`) dans un Postgres 17 jetable, conteneur à part de `shared-postgres` (sans réseau, 1 Go de
   mémoire au plus, aucun mot de passe), supprimé à la fin comme le fichier déchiffré ;
4. **contenu** : défi du jour de la sauvegarde présent (ou celui de la veille), dernière migration de la sauvegarde connue de la prod, et
   nombre de lignes des tables qui ne font que grossir (joueurs, comptes, morceaux, défis, parties, réponses, séries, playlists et parties de
   Platines) au moins égal à 95 % de la prod (`BACKUP_VERIFY_MIN_ROW_PERCENT`) ; la prod n'est que lue ;
5. **compte rendu** : ligne `verify` dans `infra.backup_runs`, signal au contrôle healthchecks.io `inseconds-backup-restore`, logs vers Grafana.

Il tourne **chaque nuit à 4 h UTC**, une heure après la sauvegarde, par le timer `inseconds-backup-verify.timer` (`systemd/`,
`Persistent=true`), qui lance le script du checkout de prod. À la main : `sudo systemctl start inseconds-backup-verify` (journal :
`journalctl -u inseconds-backup-verify -n 80`) ou `./backup-verify.sh`. Une à deux minutes pour la base actuelle.

**Installation (une fois, sur le VPS, après le déploiement qui l'apporte)** :

```bash
sudo cp ~/apps/InSeconds/deploy/infra/systemd/inseconds-backup-verify.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now inseconds-backup-verify.timer
sudo systemctl start inseconds-backup-verify   # premier contrôle tout de suite : le contrôle healthchecks.io se crée
systemctl list-timers inseconds-backup-verify  # prochain passage : 4 h UTC
```

Puis, dans healthchecks.io, régler `inseconds-backup-restore` comme `inseconds-backup` (période 1 jour, délai de grâce 1 heure, ou *Cron*
`0 4 * * *` en UTC).

**En cas d'échec** : l'email de healthchecks.io donne l'étape et la raison ; le journal complet est dans Grafana (panneau « Journal des
sauvegardes ») et sur le VPS (`journalctl`). Les cas les plus probables : sauvegarde de la nuit absente ou en échec (étape 1, voir d'abord
`inseconds-backup`), phrase de passe changée dans `.env` sans être celle des copies déjà faites (étape 2), dump coupé ou format incompatible
(étape 3), lignes perdues ou défi du jour absent (étape 4 : vérifier aussi que le défi du jour a bien été généré).

### Restaurer

`./backup.sh restore-test [fichier]` restaure à la main un dump (le plus récent du VPS par défaut) dans le même Postgres jetable que le
contrôle, affiche le nombre de lignes par table, puis le supprime. La base de prod n'est jamais touchée.

Pour reprendre une sauvegarde de R2 (VPS perdu, ou besoin d'une date plus ancienne) :

```bash
./backup.sh list-remote
./backup.sh fetch monthly/inseconds-2026-10-01T030000Z.dump   # déchiffrée dans ~/backups/postgres/ (ou archive/…)
./backup.sh restore-test ~/backups/postgres/inseconds-2026-10-01T030000Z.dump
```

Sur un VPS neuf, il suffit de Docker, du dépôt et d'un `deploy/infra/.env` contenant les
variables R2 et la phrase de passe (depuis KeePass).

Remplacer réellement la base de prod est une opération manuelle, API arrêtée, avec la commande
de `docs/exploitation/deploiement.md` § « Restaurer un dump PostgreSQL » (`pg_restore --clean --if-exists`).
