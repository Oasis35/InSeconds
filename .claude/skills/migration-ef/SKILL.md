---
name: migration-ef
description: Créer et vérifier une migration EF Core d'InSeconds après un changement d'entité ou de configuration EF (nouvelle table, colonne, index, clé). À utiliser dès qu'un fichier de Persistence/ ou une entité persistée change.
argument-hint: <NomDeLaMigration> (ex. SocialGroupDescription)
---

# Migration EF

Argument : `$ARGUMENTS` (nom en PascalCase, qui dit ce que fait la migration).

## Avant

- Chaque entité déclare son schéma (celui de son module : `players`, `catalogue`, `daily`, `runs`, `social`, `infra`), **rien dans `public`** ; noms en snake_case.
- Pas de navigation EF entre modules : un identifiant, et une clé étrangère déclarée par le nom du type.
- Table avec une colonne `player_id` : à ajouter au contributeur RGPD du module (piège 48, `Players/PlayerDataTests` lit toutes les colonnes `player_id`).

## Créer

`dotnet-ef` est un outil global (la CI installe la version 10.0.12) : `dotnet tool install --global dotnet-ef --version 10.0.12` s'il manque.

Depuis `src/back/InSeconds.Api` :

```bash
dotnet ef migrations add $ARGUMENTS --output-dir Infrastructure/Persistence/Migrations
```

Relire le fichier généré (`Infrastructure/Persistence/Migrations/<horodatage>_$ARGUMENTS.cs`) : schéma correct, rien d'inattendu (une migration qui touche d'autres tables veut dire qu'un changement précédent n'avait pas sa migration). Une donnée existante à transformer s'écrit dans la migration (`migrationBuilder.Sql(...)`).

## Vérifier

Depuis `src/back/InSeconds.Api` (comme le job CI `back-checks`) :

```bash
dotnet ef migrations has-pending-model-changes
```

Puis depuis `src/back` : `dotnet test --solution InSeconds.slnx` (Docker requis : les tests d'intégration migrent une base modèle, `MigrationTests` couvre les scripts SQL du VPS). Une colonne de `infra.backup_runs` changée doit suivre dans `deploy/infra/backup-common.sh` (`BackupScriptsTests`).

## Après

- Les migrations s'appliquent au démarrage de l'API et par `--migrate-only` au déploiement : une migration doit passer sur la base de prod (pas de `NOT NULL` sans valeur par défaut sur une table remplie).
- Commiter la migration, son `.Designer.cs` et `InSecondsDbContextModelSnapshot.cs` ensemble.
- Ne jamais modifier une migration déjà mergée dans `env/staging` : en ajouter une nouvelle.
