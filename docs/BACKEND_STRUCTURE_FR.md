# Architecture Backend (.NET 10)

> Ce document ne duplique plus l'architecture backend : il a été ramené à un renvoi le 2026-09-24, car sa copie parallèle dérivait du code à chaque fonctionnalité.

La référence est tenue à jour à côté du code :

- [`CLAUDE.md`](../CLAUDE.md) (racine) — conventions vertical slice, règles dures, mécanisme des Settings, modèle de données (10 tables), pièges connus.
- [`src/back/InSeconds.Api/CLAUDE.md`](../src/back/InSeconds.Api/CLAUDE.md) — chaque feature slice et son endpoint, entités `Domain/`, configurations EF et migrations structurantes, services `Common/`, pipeline `Program.cs`.
- [`src/back/InSeconds.Deezer/CLAUDE.md`](../src/back/InSeconds.Deezer/CLAUDE.md) — `DeezerClient` / `CachedDeezerClient` / `FakeDeezerHandler`.
- [`GAMEPLAY_RULES_FR.md`](GAMEPLAY_RULES_FR.md) — règles produit (scoring, anti-triche, série, indices).
