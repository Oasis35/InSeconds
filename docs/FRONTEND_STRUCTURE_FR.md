# Architecture Frontend (Angular 22)

> Ce document ne duplique plus l'architecture frontend : il a été ramené à un renvoi le 2026-09-24, car sa copie parallèle dérivait du code à chaque fonctionnalité.

La référence est tenue à jour à côté du code :

- [`CLAUDE.md`](../CLAUDE.md) (racine) — stack, providers globaux, conventions de templates, palette `:root`, composants partagés, NSwag.
- [`src/front/InSeconds.Client/src/app/features/game/CLAUDE.md`](../src/front/InSeconds.Client/src/app/features/game/CLAUDE.md) — machine à états du jeu, `BlindRoundComponent`, `AudioPlayerService`, services extraits, écrans, gel de série.
- [`src/front/InSeconds.Client/src/app/features/admin/CLAUDE.md`](../src/front/InSeconds.Client/src/app/features/admin/CLAUDE.md) — shell admin, 7 services, 8 sous-composants, chargement paresseux par onglet.
- [`GAMEPLAY_RULES_FR.md`](GAMEPLAY_RULES_FR.md) — règles produit côté joueur.
