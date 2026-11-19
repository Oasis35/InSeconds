# Survie

Le second mode de jeu d'InSeconds, **sur invitation**. Le joueur enchaîne des **manches de 3 morceaux**, de moins en moins connus, jusqu'à perdre ses **3 vies** ou finir la **8e manche** (« Série complète »). On rejoue pour battre son record, monter de niveau (7 disques) et battre ses amis sur la même playlist (fantôme, duels, groupes, classement général). Les règles sont dans [`regles.md`](regles.md), et nulle part ailleurs.

## Les noms

| Où | Nom |
|---|---|
| À l'écran | **« Survie »** (routes `/survie`, `/history/survie`, `/survie/hits`) |
| Dans le code | **`Runs`** : module back, schéma, routes d'API, réglages `Runs:`, domaine front `runs/` |
| Dans les tickets GitHub | **« Run »** (étiquette `Mode Run`) |
| Un défi (`challenge` dans le code) | une **playlist** à l'écran |
| Les groupes et le classement | module **`Social`** (schéma `social`, domaine front `social/`, routes `/ranking`) |

« Setlist » et « Platines » sont d'anciens noms du mode : les liens `/setlist/…` et `/runs/…` redirigent vers `/survie/…`.

## Les documents

| Document | Contenu |
|---|---|
| [`regles.md`](regles.md) | **La seule source des règles** : playlist, morceau, vies, écoute et points, thèmes, fin, niveau et disques, amis, groupes, classement général, accès, Hits, réglages `Runs:` et `Social:` |
| [`ecrans.md`](ecrans.md) | Les écrans : l'interface Survie (barre du bas, accueil, historique, classements, groupes, Hits), la partie, le lien d'un ami, la comparaison, avec les maquettes de [`maquettes/proto4/`](maquettes/proto4/) |
| [`conception.md`](conception.md) | La conception technique : principe et décisions qui ne se lisent pas dans le code |
| [`plan.md`](plan.md) | Ce qui reste, les idées pour la suite, ce qu'il ne faut pas reproposer |

Détail du code : [`.claude/rules/back/runs.md`](../../.claude/rules/back/runs.md), [`.claude/rules/back/social.md`](../../.claude/rules/back/social.md) et [`.claude/rules/front/runs-social.md`](../../.claude/rules/front/runs-social.md). Chantiers terminés du mode (ancien modèle, proto 1, proto 4, niveau et classement) : [`../historique/`](../historique/README.md).

## Où suivre

Epic [#368](https://github.com/Oasis35/InSeconds/issues/368) (étiquette `Mode Run`).

## Règles qui tiennent pour tout le mode

- **Un mode ne voit jamais l'autre** : Runs et Daily ne s'importent pas (tests d'architecture, Sheriff). Runs utilise Players, Catalogue, Gameplay et Social par leurs `Contracts`, comme Daily ([`../architecture/contrats-entre-modules.md`](../architecture/contrats-entre-modules.md)).
- **Mobile first**, design système existant (tokens de `styles.scss`, `appButton`, composants du domaine `gameplay`).
- Mêmes protections que le défi du jour : score calculé par le serveur, rien qui identifie un morceau avant la réponse (piège 31), verrou du morceau en cours (piège 35), jamais le texte saisi dans les journaux ni en base.
