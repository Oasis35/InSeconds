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
| `import-to-staging.sh` | sur le VPS : arrête l'API staging, lance l'import, seconde anonymisation des tables v2 (S8), relance l'API |

L'import se construit **module par module** : chaque PR d'import ajoute sa partie à `10-import.sql` et `20-verify.sql`, et ses tests à `src/v2/back/tests/InSeconds.MigrationTests`.

| Partie | PR | Contenu |
|---|---|---|
| Players | B4 | joueurs (suppression comprise), comptes, un jeton v1 haché par joueur (`legacy_tokens`), jetons envoyés par email encore valables, clés Data Protection |
| Catalogue | C2 | morceaux |
| Daily | E4 | défis, sessions, réponses, séries, stats figées |
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

## Rejouer, revenir en arrière

- **Rejouable** : l'import vide d'abord les tables v2 qu'il remplit. Le relancer remet la v2 dans l'état de la v1 du moment ; tout ce qui a été fait en v2 depuis (sessions d'appareils, parties) est perdu.
- **Retour arrière** : l'import ne modifie jamais `public`. Si la vérification échoue, la transaction est annulée, la v2 reste dans son état précédent et la v1 peut redémarrer telle quelle.

## Tests

`src/v2/back/tests/InSeconds.MigrationTests` : une base de forme v1 générée depuis le code v1 (`dotnet ef migrations script`, variable `INSECONDS_V1_SCHEMA_SQL` en CI, généré par les tests eux-mêmes sinon), les migrations v2, des cas limites, puis le vrai `run-import.sh` exécuté dans le conteneur PostgreSQL. Test de bout en bout : un cookie émis par la v1 est accepté par la v2 après import, même joueur, deux navigateurs donnent deux appareils.
