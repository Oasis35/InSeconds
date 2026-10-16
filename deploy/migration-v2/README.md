# Import v1 → v2

Reprise des données de la v1 (schéma `public`) dans les schémas v2, § 8 de [`docs/refonte-v2/PLAN.md`](../../docs/refonte-v2/PLAN.md). Le même script a servi au staging (répétitions) et à la prod (bascule).

> **Après la bascule (16/10/2026) et la PR I1 (#235)** : l'import a servi, la v2 est ouverte en prod (`opened_at` posé, un nouvel import est refusé). Le workflow « Bascule v2 », `deploy/vps/switch-to-v2.sh` et `import-to-staging.sh` sont retirés ; « Copy prod DB to staging » copie désormais les schémas v2 de la prod, sans import (`deploy/vps/copy-prod-db-to-staging.sh`). Les tables v1 de `public` se suppriment par `deploy/vps/drop-v1-tables.sh` (cf. « Suppression des tables v1 »), après quoi l'import ne peut plus tourner. Les scripts d'import et leurs tests partent en I2 (#236). Les sections « Staging » et « La bascule » ci-dessous décrivent ce qui a été fait.

## Contenu

| Fichier | Rôle |
|---|---|
| `run-import.sh [--force]` | enchaîne les scripts ci-dessous dans **une seule transaction** (`psql --single-transaction`, `ON_ERROR_STOP`) : au moindre écart, rien n'est gardé. POSIX `sh`, tourne aussi dans l'image `postgres:17-alpine` |
| `00-import-state.sql` | crée `infra.import_state` s'il n'existe pas (`imported_at`, `opened_at`) ; **garde** : refuse l'import si la v2 est ouverte, sauf `--force` (G1) |
| `05-check-source.sql` | **forme de la source** (G1) : les tables de `public` sont exactement celles que l'import connaît (colonnes, types, nullabilité) |
| `10-import.sql` | vide les tables v2 qu'il remplit, puis `INSERT … SELECT` depuis `public` ; pré-contrôles avec messages clairs |
| `20-verify.sql` | vérifications bloquantes (§ 8.5) : une exception au moindre écart |
| `90-import-done.sql` | note l'import réussi (`imported_at`) |
| `30-verify-day-stats.sql` | **après** `--freeze-day-stats` (pas dans `run-import.sh`) : chaque jour terminé a sa photo, aux compteurs de la v1, avec les paliers importés (G1) |
| `mark-opened.sql` | à la bascule : note l'ouverture de la v2 aux joueurs (`opened_at`), qui arme la garde (G1) |
| `staging-anonymize.sql` | staging seulement, lancé par `deploy/vps/copy-prod-db-to-staging.sh` après la copie des schémas v2 de la prod (`-v keep=<STAGING_KEEP_EMAIL>`, avant I1 : par `import-to-staging.sh` après l'import) : anonymisation des tables v2 (S8) : adresses et rôle admin (sauf l'adresse gardée), jetons, appareils, `legacy_tokens`, clés Data Protection, et la file de Wolverine dans `messaging` (messages à traiter, à envoyer **et en erreur**, qui gardent le corps du message) |
| `drop-v1-tables.sql` | I1 (#235), lancé par `deploy/vps/drop-v1-tables.sh` : supprime les tables v1 de `public`, une seule transaction ; refusé tant que la v2 n'est pas notée ouverte (`opened_at`) ou si `public` contient une table inconnue |

L'import se construit **module par module** : chaque PR d'import ajoute sa partie à `10-import.sql` et `20-verify.sql`, et ses tests à `src/v2/back/tests/InSeconds.MigrationTests`.

| Partie | PR | Contenu |
|---|---|---|
| Players | B4 | joueurs (suppression comprise), comptes, un jeton v1 haché par joueur (`legacy_tokens`), jetons envoyés par email encore valables, clés Data Protection |
| Catalogue | C2 | morceaux (identifiants conservés, extrait, désactivation), séquence des identifiants remise à niveau |
| Daily | E4 | défis et leurs morceaux, parties (verrou joint sur le même défi), réponses, séries ; vérifications des scores et des séries, écarts de cooldown listés (non bloquants). Les stats figées se calculent après, par `--freeze-day-stats` |
| Complet | G1 | contrôle de forme de la source, garde `opened_at` / `--force`, réglages (`infra.settings`), vérification des statistiques figées |

Les messages ne contiennent que des nombres et des identifiants, jamais d'email ni de pseudo (S13).

## Lancer l'import

Prérequis : les migrations v2 appliquées sur la base (l'API v2 avec `--migrate-only`).

```bash
PGHOST=… PGPORT=5432 PGUSER=… PGPASSWORD=… PGDATABASE=… sh deploy/migration-v2/run-import.sh
```

Sur le VPS, depuis un conteneur jetable :

```bash
docker run --rm --network shared-postgres -v "$PWD/deploy/migration-v2:/import:ro" \
  -e PGHOST=shared-postgres -e PGUSER=… -e PGPASSWORD=… -e PGDATABASE=… \
  postgres:17-alpine sh /import/run-import.sh
```

**Staging** : workflow manuel « Copy prod DB to staging », lancé depuis la branche `env/staging` (« Use workflow from »). Il copie `public` depuis la prod, anonymise les tables v1, lance l'import, puis anonymise les tables v2. Le workflow n'est listé que parce qu'il existe sur `main` (version v1, copie seule) ; c'est la version de la branche choisie qui s'exécute.

**Bascule (G2)** : faite en prod le 16/10/2026 par le workflow « Bascule v2 », retiré ensuite (I1). Voir « La bascule (G2) » plus bas.

## Suppression des tables v1 (I1)

Sur le VPS, depuis le checkout de la cible, une fois la v2 ouverte :

```bash
cd ~/apps/InSeconds-staging && ./deploy/vps/drop-v1-tables.sh staging
cd ~/apps/InSeconds && ./deploy/vps/drop-v1-tables.sh prod
```

Le script demande de retaper le nom de la cible. En prod, il lance d'abord `deploy/infra/backup.sh archive` (sauvegarde complète envoyée dans `archive/` sur R2, jamais supprimée par la rotation, cf. `deploy/infra/README.md` § Sauvegarde archivée) et ne supprime rien si l'archive échoue. Puis `drop-v1-tables.sql` : garde `opened_at`, refus si `public` contient une table que l'import ne connaît pas, suppression des onze tables v1 (ordre des clés étrangères, sans `CASCADE`), rejouable. L'API n'est pas arrêtée : la v2 ne lit jamais `public`. Tests : `MigrationTests/DropV1TablesTests`.

## L'import complet, dans l'ordre (G1)

Ce que la bascule (G2) et le staging enchaînent, v1 arrêtée et API v2 pas encore démarrée :

1. `run-import.sh` : garde, forme de la source, import de tous les modules et des réglages, vérifications, une seule transaction ;
2. `dotnet InSeconds.Api.dll --rotate-data-protection-key` (ci-dessous) ;
3. `dotnet InSeconds.Api.dll --freeze-day-stats` : fige l'historique **avec les réglages importés** (paliers et barème) ;
4. `psql -v ON_ERROR_STOP=1 -f 30-verify-day-stats.sql` : chaque jour terminé (J-2 et avant) a sa photo, et ses compteurs (parties terminées, abandonnées, expirées, score le plus bas et le plus haut, joueurs supprimés exclus) sont ceux de la v1 ; les paliers figés sont ceux des réglages importés ;
5. en prod seulement, au moment de rouvrir le site sur la v2 : `psql -v ON_ERROR_STOP=1 -f mark-opened.sql`.

Les sessions d'appareils ne sont pas importées (§ 8.2 du plan) : chaque appareil en ouvre une à sa première visite, avec son cookie v1.

## Forme de la source (G1)

`05-check-source.sql` compare les tables de `public` à la liste des colonnes que l'import connaît (nom, type, nullabilité), **colonnes abandonnées comprises** (§ 8.3). Une colonne ou une table en plus, une colonne absente, un type ou une nullabilité qui change : l'import s'arrête avant de rien toucher, avec la liste des écarts (`Players.Avatar : inconnue de l'import`). C'est le signe d'une migration v1 arrivée pendant le chantier : adapter la liste, `10-import.sql` et `20-verify.sql`, puis relancer. `MigrationTests` crée la base de test depuis `v1-schema.sql`, figé depuis la suppression du code v1 (I2).

## Garde `opened_at` / `--force` (G1)

Une fois la v2 ouverte aux joueurs (`mark-opened.sql`, à la bascule), un nouvel import viderait les tables v2 et effacerait ce qui y a été joué (risque E2 du plan). `run-import.sh` le refuse alors (« La v2 est ouverte aux joueurs depuis le … »), sauf `run-import.sh --force`, réservé à un retour arrière décidé : l'import est rejoué, la date d'ouverture est gardée (la garde vaut aussi pour le suivant). `mark-opened.sql` exige un import réussi et garde la première date s'il est relancé. Sur le staging, `opened_at` n'est jamais posé : les copies prod → staging restent rejouables sans option.

## Réglages (G1)

`public."Settings"` → `infra.settings`, les onze clés de la v1 (valeurs par défaut comprises), avec leur description et leur date, préfixées par le module qui les lit (`Daily:…`, `Catalogue:CoverUrlTemplate`). Les valeurs texte de la v1 deviennent du JSON : entier, liste (`"0.50,1,1.5"` → `[0.5, 1, 1.5]`), barème (`"0.50:1000,…"` → `[{"seconds": 0.5, "score": 1000}, …]`), pénalités d'indice (`"1:30,2:60"` → `{"1": 30, "2": 60}`). La correspondance est la table `import_setting_map` de `10-import.sql`. **Une clé inconnue, ou une valeur illisible** (élément non numérique, liste vide, palier en double), **arrête l'import** en nommant la clé : la v1 ignorait sans bruit une entrée illisible. **Un entier hors des bornes que la v2 accepte arrête aussi l'import** (G6e, #316), clé et bornes nommées (`TrackCooldownDays (0 à 3650)`) : la v2 retomberait sans bruit sur sa valeur par défaut (`TrackCooldownDays` de 0 à 3650, `TracksPerChallenge` à partir de 1, les `Effective…` de `DailyOptions`) ou refuserait de démarrer (`StreakFreeze*` et `StreakLostNudgeMinDays` négatifs, `DailyOptionsChecks`) ; bornes dans la table `import_setting_bounds`. Les réglages propres à la v2 (`Catalogue:Refresh:…`) ne sont pas touchés ; ceux que l'import gère sont remplacés à chaque import. `20-verify.sql` relit chaque valeur depuis le JSON, comme le binder de l'API, et la compare au texte de la v1, élément par élément.

## Clé Data Protection neuve, après chaque import (S16)

L'import copie les clés Data Protection de la v1, **en clair** : la v1 ne les chiffre pas. Sans clé neuve, la plus récente d'entre elles encore valable (jusqu'à 90 jours) deviendrait la clé par défaut de la v2 et chiffrerait les nouveaux cookies avec une clé lisible en base, ce que le certificat (S16) doit éviter. Il faut donc créer une clé neuve **juste après l'import et avant de démarrer l'API v2** :

```bash
dotnet InSeconds.Api.dll --rotate-data-protection-key      # même configuration que l'API : base et certificat
```

La commande (`RotateDataProtectionKeyCommand`, sur le modèle de `--migrate-only`) ne démarre ni serveur ni tâche : elle crée une clé active tout de suite, valable 90 jours, chiffrée par le certificat `DataProtection:CertificatePath` (exigé en prod et en staging). Les clés de la v1 restent en place pour relire les cookies v1 jusqu'à leur remplacement. À relancer après **chaque** import, qui vide d'abord `infra.data_protection_keys`. À reprendre dans la procédure de bascule (G2).

Sur le staging, `import-to-staging.sh` la lance **après** la seconde anonymisation, qui vide les clés : avant, elle effacerait la clé neuve. Les clés de la v1 y sont déjà retirées par la première anonymisation, donc ce pas répète la procédure de bascule et vérifie la commande avec le vrai certificat, sans remplacer de clé en clair. L'image de l'API staging doit venir d'un déploiement de la PR B4 ou postérieur.

## Parties en cours, à l'import (E4)

Une partie en cours dont les réponses ne vont pas de 1 à N sans trou (la v1 n'imposait l'ordre des morceaux que si le verrou était posé), ou qui n'a plus de morceau à jouer, ne pourrait plus continuer en v2 : elle est reprise **expirée**, réponses gardées. Une partie en cours d'un défi plus vieux que la veille (que la v2 refuse de jouer) aussi, comptée à part (`Parties en cours d'un défi plus vieux que la veille, reprises en « expirées » : N`, un cas normal : la v1 attendait le retour du joueur pour l'expirer). Un verrou de morceau qui ne porte pas sur le morceau en cours est écarté. L'import le dit (`Parties en cours aux réponses non contiguës, reprises en « expirées » : N`, `Verrous de morceau écartés … : N`) ; en prod, un nombre inattendu se regarde avant la bascule. Le reste (statut, verrou d'une partie finie, scores, séries) est repris tel quel et relu par `20-verify.sql`.

## Statistiques figées de l'historique, après l'import (E4)

L'import ne calcule rien : la tâche `daily-close-day` n'attendrait que minuit pour figer l'historique. Juste après l'import (qui reprend les réglages depuis G1 : la photo fige les paliers et le barème importés), avant d'ouvrir la v2 :

```bash
dotnet InSeconds.Api.dll --freeze-day-stats      # même configuration que l'API : base
```

La commande (`FreezeDayStatsCommand`) fige tout jour terminé (J-2 et avant) resté sans photo, du plus ancien au plus récent, par la règle de la tâche. Ni serveur ni tâche ne démarrent. Un jour qui échoue n'empêche pas les suivants ; le code de sortie est 1 s'il y en a eu. Des réglages du jeu incohérents (le contrôle du démarrage de l'API) : rien n'est figé, code de sortie 1. Rejouable : un jour déjà figé n'est pas refait. La veille et le jour même restent calculés en direct (une partie peut encore s'y finir après minuit).

Sur le staging, `import-to-staging.sh` la lance après la clé Data Protection neuve ; comme elle, elle exige une image de l'API staging venue d'un déploiement de la PR E4 ou postérieur. Puis il lance `30-verify-day-stats.sql` (G1).

## Rejouer, revenir en arrière

- **Rejouable** : l'import vide d'abord les tables v2 qu'il remplit. Le relancer remet la v2 dans l'état de la v1 du moment ; tout ce qui a été fait en v2 depuis (sessions d'appareils, parties) est perdu. Après l'ouverture de la v2 (`mark-opened.sql`), seulement avec `--force`.
- **Retour arrière** : l'import ne modifie jamais `public`. Si la vérification échoue, la transaction est annulée, la v2 reste dans son état précédent et la v1 peut redémarrer telle quelle.

## Tests

`src/v2/back/tests/InSeconds.MigrationTests` : une base de forme v1 créée par `v1-schema.sql` (généré par `dotnet ef migrations script` sur le code v1 juste avant sa suppression, I2), les migrations v2, des cas limites, puis le vrai `run-import.sh` exécuté dans le conteneur PostgreSQL. Test de bout en bout : un cookie émis par la v1 est accepté par la v2 après import, même joueur, deux navigateurs donnent deux appareils. `CompleteImportTests` (G1) : forme de la source, garde et `--force`, `mark-opened.sql`, réglages (valeurs par défaut et modifiées, relues par le vrai binder de l'API v2, clé inconnue, valeur illisible, chaque contrôle de `20-verify.sql`), import complet d'un bloc (import, photos, `30-verify-day-stats.sql`) et ses contrôles.

## La bascule (G2)

Faite en prod le 16/10/2026 (run « Bascule v2 » #5), après deux répétitions sur le staging. Le workflow (`bascule-v2.yml`) et son script (`deploy/vps/switch-to-v2.sh`) ont été retirés en I1 (#235), la prod v1 (`docker-compose.prod.yml`) qu'ils redémarraient en cas d'échec avec le code v1 (I2, #236) ; ils restent lisibles dans l'historique git. Elle enchaînait : préparation sans arrêt (certificat, image, `--migrate-only`), arrêt de l'API v1, `run-import.sh`, clé Data Protection neuve, `--freeze-day-stats` et `30-verify-day-stats.sql`, démarrage de la v2 sous les mêmes noms de conteneurs, puis `mark-opened.sql` ; retour arrière vers la v1 au moindre écart avant l'ouverture.
