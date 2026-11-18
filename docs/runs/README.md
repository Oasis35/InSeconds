# Survie (mode Run) : la Série

Le second mode de jeu d'InSeconds, **sur invitation**. Le joueur enchaîne des **manches de 3 morceaux**, de moins en moins connus, jusqu'à perdre ses **3 vies** ou finir la **8e manche** (« Série complète », avec un bonus par vie restante). Une manche sans vie perdue rend une vie. L'écoute raccourcit après une manche sans vie perdue (10, 5, 3, 2, 1, 0,5 s) et reste en place après une vie perdue ; un morceau trouvé rapporte les points de son palier (100 à 1 200). À partir de la manche 2, on choisit un thème pour la manche. On rejoue pour battre son record, monter de niveau (disques) et battre ses amis sur la même playlist (fantôme, duels, groupes).

Noms : **« Run »** dans les tickets GitHub (étiquette `Mode Run`), **`Runs`** dans le code (module back, schéma, routes d'API, réglages, domaine front), **« Survie »** à l'écran (routes `/survie`). Un défi (`challenge` dans le code) s'appelle une **playlist** à l'écran.

> **Histoire** : le proto 1 (4 manches, jauge) est livré depuis le 27/10/2026, les protos 2 et 3 (difficultés, cartes, Échange) l'ont complété, puis la refonte « la Série » (novembre 2026) les a remplacés. Un ancien mécanisme (objectifs, jauge, difficultés, boss, cartes, réserve de morceaux) n'existe plus : ses documents sont dans [`../historique/runs-ancien-modele/`](../historique/runs-ancien-modele/).

## Les documents

| Document | Contenu |
|---|---|
| [`regles.md`](regles.md) | Les règles de la Série : vies, paliers d'écoute, points, thèmes, fin, fantôme, accès, réglages |
| [`ecrans.md`](ecrans.md) | Les écrans du mode et leur enchaînement |
| [`conception.md`](conception.md) | La conception technique : principe, tirage, ce qui est réutilisé, où lire le détail |
| [`proto4.md`](proto4.md) | La V4 : barre du bas, accueil, historique, nom Survie, niveau et disques, groupes et classement ; découpage en 8 PR, avec les 16 écrans de référence dans [`maquettes/proto4/`](maquettes/proto4/) |
| [`niveau-classement.md`](niveau-classement.md) | Niveau (7 disques) et classement général : décisions, plan de dev en 4 PR, maquettes |
| [`plan.md`](plan.md) | Ce qui reste, les idées pour la suite et les décisions |

Détail du code : [`src/back/CLAUDE.md`](../../src/back/CLAUDE.md) § Module Runs, [`src/front/CLAUDE.md`](../../src/front/CLAUDE.md) § Domaine runs.

## Où suivre

- Epic : [#368](https://github.com/Oasis35/InSeconds/issues/368) ; la V4 : [#555](https://github.com/Oasis35/InSeconds/issues/555).
- Découpage du proto 1 (livré) : [`../historique/runs-proto1-decoupage.md`](../historique/runs-proto1-decoupage.md).

## Règles qui tiennent pour tout le mode

- **Un mode ne voit jamais l'autre** : Runs et Daily ne s'importent pas (tests d'architecture, Sheriff). Runs utilise Players, Catalogue et Gameplay par leurs `Contracts`, comme Daily ([`../architecture/contrats-entre-modules.md`](../architecture/contrats-entre-modules.md)).
- **Mobile first**, design système existant (tokens de `styles.scss`, `appButton`, composants du domaine `gameplay`).
- Mêmes protections que le Daily : score calculé par le serveur, rien qui identifie un morceau avant la réponse (piège 31), verrou du morceau en cours (piège 35), jamais le texte saisi dans les journaux ni en base.
