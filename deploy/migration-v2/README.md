# Import v1 → v2

Reprise des données de la v1 (schéma `public`) dans les schémas v2, § 8 de [`docs/refonte-v2/PLAN.md`](../../docs/refonte-v2/PLAN.md). Le même script sert au staging (répétitions) et à la prod (bascule).

## Contenu

| Fichier | Rôle |
|---|---|
| `run-import.sh` | enchaîne les scripts ci-dessous dans **une seule transaction** (`psql --single-transaction`, `ON_ERROR_STOP`) : au moindre écart, rien n'est gardé. POSIX `sh`, tourne aussi dans l'image `postgres:17-alpine` |
| `00-import-state.sql` | crée `infra.import_state` s'il n'existe pas (`imported_at`, `opened_at`) |
| `10-import.sql` | vide les tables v2 qu'il remplit, puis `INSERT … SELECT` depuis `public` ; pré-contrôles avec messages clairs |
| `20-verify.sql` | vérifications bloquantes (§ 8.5) : une exception au moindre écart |
| `90-import-done.sql` | note l'import réussi (`imported_at`) |
| `import-to-staging.sh` | sur le VPS : arrête l'API staging, lance l'import, seconde anonymisation des tables v2 (S8, qui vide aussi `legacy_tokens` et la file `messaging`), crée une clé Data Protection neuve, relance l'API |

L'import se construit **module par module** : chaque PR d'import ajoute sa partie à `10-import.sql` et `20-verify.sql`, et ses tests à `src/v2/back/tests/InSeconds.MigrationTests`.

| Partie | PR | Contenu |
|---|---|---|
| Players | B4 | joueurs (suppression comprise), comptes, un jeton v1 haché par joueur (`legacy_tokens`), jetons envoyés par email encore valables, clés Data Protection |
| Catalogue | C2 | morceaux (identifiants conservés, extrait, désactivation), séquence des identifiants remise à niveau |
| Daily | E4 | défis et leurs morceaux, parties (verrou joint sur le même défi), réponses, séries ; vérifications des scores et des séries, écarts de cooldown listés (non bloquants). Les stats figées se calculent après, par `--freeze-day-stats` |
| Complet | G1 | contrôle de forme de la source, garde `opened_at` / `--force` |

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

L'import ne calcule rien : la tâche `daily-close-day` n'attendrait que minuit pour figer l'historique. Juste après l'import (**et après celui des réglages**, G1 : la photo fige les paliers et le barème des réglages), avant d'ouvrir la v2 :

```bash
dotnet InSeconds.Api.dll --freeze-day-stats      # même configuration que l'API : base
```

La commande (`FreezeDayStatsCommand`) fige tout jour terminé (J-2 et avant) resté sans photo, du plus ancien au plus récent, par la règle de la tâche. Ni serveur ni tâche ne démarrent. Un jour qui échoue n'empêche pas les suivants ; le code de sortie est 1 s'il y en a eu. Des réglages du jeu incohérents (le contrôle du démarrage de l'API) : rien n'est figé, code de sortie 1. Rejouable : un jour déjà figé n'est pas refait. La veille et le jour même restent calculés en direct (une partie peut encore s'y finir après minuit).

Sur le staging, `import-to-staging.sh` la lance après la clé Data Protection neuve ; comme elle, elle exige une image de l'API staging venue d'un déploiement de la PR E4 ou postérieur.

## Rejouer, revenir en arrière

- **Rejouable** : l'import vide d'abord les tables v2 qu'il remplit. Le relancer remet la v2 dans l'état de la v1 du moment ; tout ce qui a été fait en v2 depuis (sessions d'appareils, parties) est perdu.
- **Retour arrière** : l'import ne modifie jamais `public`. Si la vérification échoue, la transaction est annulée, la v2 reste dans son état précédent et la v1 peut redémarrer telle quelle.

## Tests

`src/v2/back/tests/InSeconds.MigrationTests` : une base de forme v1 générée depuis le code v1 (`dotnet ef migrations script`, variable `INSECONDS_V1_SCHEMA_SQL` en CI, généré par les tests eux-mêmes sinon), les migrations v2, des cas limites, puis le vrai `run-import.sh` exécuté dans le conteneur PostgreSQL. Test de bout en bout : un cookie émis par la v1 est accepté par la v2 après import, même joueur, deux navigateurs donnent deux appareils.
