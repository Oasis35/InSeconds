# Architecture Backend (.NET 10)

> Ce document ne duplique pas l'architecture backend : c'est un renvoi depuis le 2026-09-24, car sa copie parallèle dérivait du code à chaque fonctionnalité.

La référence est tenue à jour à côté du code :

- [`CLAUDE.md`](../CLAUDE.md) (racine) — modules et règles de dépendance, réglages, tâches planifiées, modèle de données, pièges connus.
- [`src/v2/back/CLAUDE.md`](../src/v2/back/CLAUDE.md) — chaque module (Players, Catalogue, Gameplay, Daily), ses routes et ses tests, l'authentification, le client Deezer, l'hôte de test, l'import v1 → v2.
- [`GAMEPLAY_RULES_FR.md`](GAMEPLAY_RULES_FR.md) — règles produit (scoring, anti-triche, série, indices).

