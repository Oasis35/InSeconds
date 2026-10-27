# Run (Platines) : le nouveau mode de jeu

> **État au 27/10/2026 : la partie est jouable sur invitation, et le lien d'un ami fonctionne.** Le module `Runs` existe (schéma `runs`, défi et tirage par difficulté, réglages, accès sur invitation et son interrupteur dans l'onglet Joueurs de l'admin) avec ses routes de jeu (lancer, relever un lien, jouer, jauge, neutralisation, fin, record, abandon), les écrans de la partie (route `/runs`, carte Platines sur l'accueil) et leurs E2E (`runs.spec.ts`), le lien d'un ami (`/runs/<code>` : lien reçu, reprise, comparaison, route `GET /api/runs/challenges/{code}/comparison`) ; reste la relecture finale ([`plan.md`](plan.md#découpage-du-proto-1-en-pr)). Détail du code : `src/back/CLAUDE.md` § Module Runs, `src/front/CLAUDE.md`.

Un run, c'est une suite de **4 manches de 5 morceaux**, de plus en plus difficiles. À chaque manche, il faut remplir une jauge de points pour débloquer la suivante. À la fin, on gagne un **disque** (rayé, cire, bronze, argent, or) selon les manches passées, et on peut envoyer la même playlist à ses amis pour comparer les scores.

Noms : **« Run »** dans les tickets GitHub (étiquette `Mode Run`), **`Runs`** dans le code (module back, schéma, routes, réglages, domaine front), **« Platines »** à l'écran (nom provisoire, il ne vit que dans les traductions : le changer ne touche que les textes). Un défi (`challenge` dans le code) s'appelle une **playlist** à l'écran (Clément, 18/10).

## Les documents

| Document | Contenu |
|---|---|
| [`regles.md`](regles.md) | Les règles du proto 1 : manches, points, jauge, disques, playlist partagée, accès |
| [`ecrans.md`](ecrans.md) | Les écrans, qui font référence : maquettes à intégrer telles quelles, avec le design système existant |
| [`conception.md`](conception.md) | La conception technique : module `Runs`, données, routes, codes d'erreur, front, ce qui change dans Players et Catalogue |
| [`plan.md`](plan.md) | La feuille de route (proto 1, proto 2, plus tard), le découpage en PR, les idées de bonus, l'historique des décisions |

## Où suivre

- Epic : [#368](https://github.com/Oasis35/InSeconds/issues/368) ; proto 1 : [#360](https://github.com/Oasis35/InSeconds/issues/360), un sous-ticket par PR (cf. [`plan.md`](plan.md#découpage-du-proto-1-en-pr)).
- Maquettes interactives : artifact Design « Platines » sur claude.ai (privé, lien dans #360). Les images de [`maquettes/`](maquettes/) en sont la copie figée au 18/10/2026.

## Règles qui tiennent pour tout le mode

- **Un mode ne voit jamais l'autre** : Runs et Daily ne s'importent pas (tests d'architecture, Sheriff). Runs utilise Players, Catalogue et Gameplay par leurs `Contracts`, comme Daily ([`../architecture/contrats-entre-modules.md`](../architecture/contrats-entre-modules.md)).
- **Mobile first**, design système existant (tokens de `styles.scss`, `appButton`, composants du domaine `gameplay`).
- Mêmes protections que le Daily : score calculé par le serveur, rien qui identifie un morceau avant la réponse (piège 31), verrou du morceau en cours (piège 35), jamais le texte saisi dans les journaux ni en base.
