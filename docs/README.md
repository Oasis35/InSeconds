# Documentation d'InSeconds

InSeconds est un blind test musical : un défi du jour, le même pour tout le monde, et un second mode, la Survie (`Runs` dans le code), sur invitation. Ce tableau dit où vit chaque information ; chacune n'est écrite qu'à un seul endroit, pour qu'aucune copie ne dérive du code.

## Où trouver quoi

| Besoin | Document |
|--------|----------|
| **Démarrer** | |
| Présentation, installation, lancement, tests | [`README.fr.md`](../README.fr.md) |
| Règles dures, conventions, modèle de données, index des pièges connus | [`CLAUDE.md`](../CLAUDE.md) racine |
| Back : commandes, structure, recettes, tests | [`src/back/CLAUDE.md`](../src/back/CLAUDE.md) |
| Front : commandes, couches, frontières, recettes, tests | [`src/front/CLAUDE.md`](../src/front/CLAUDE.md) |
| Le savoir de chaque module, domaine front et du déploiement (invariants, pièges, où regarder), en règles à portée de chemin : chaque fichier déclare ses `paths` et n'est chargé par Claude Code que quand on touche un fichier qui correspond ; le tableau des réglages est dans `back/reglages.md` | `.claude/rules/` |
| Sous-agents de relecture (`relecteur-pr`, `gardien-code`, `gardien-da`, `gardien-rgpd`) | [`.claude/agents/`](../.claude/agents/) |
| **Le jeu** | |
| Règles du défi du jour (score, anti-triche, série, indices) | [`regles-du-jeu.md`](regles-du-jeu.md) |
| Ce qui reste à faire | [`taches.md`](taches.md) |
| **La Survie** | |
| Sommaire du mode | [`runs/README.md`](runs/README.md) |
| Règles (vies, paliers, thèmes, fantôme, niveau) | [`runs/regles.md`](runs/regles.md) |
| Écrans | [`runs/ecrans.md`](runs/ecrans.md) |
| Conception technique | [`runs/conception.md`](runs/conception.md) |
| Ce qui reste, idées | [`runs/plan.md`](runs/plan.md) |
| **Architecture** | |
| Décisions déjà prises, et pourquoi | [`architecture/decisions.md`](architecture/decisions.md) |
| Frontières entre modules (`Contracts/`) | [`architecture/contrats-entre-modules.md`](architecture/contrats-entre-modules.md) |
| **Exploitation** | |
| VPS, stacks, déploiement, staging, commandes utiles | [`exploitation/deploiement.md`](exploitation/deploiement.md) |
| Secrets : inventaire, rôle, renouvellement | [`exploitation/secrets.md`](exploitation/secrets.md) |
| CI, SonarCloud, Dependabot, quand un job casse | [`exploitation/ci.md`](exploitation/ci.md) |
| Accès SSH de secours | [`exploitation/acces-secours-ssh.md`](exploitation/acces-secours-ssh.md) |
| Postgres partagé, sauvegardes, contrôle de restauration | [`deploy/infra/README.md`](../deploy/infra/README.md) |
| Caddy, filtre Cloudflare | [`deploy/caddy/README.md`](../deploy/caddy/README.md) |
| Tableaux de bord Grafana | [`deploy/grafana/README.md`](../deploy/grafana/README.md) |
| **Conformité** | |
| Conditions de l'API Deezer | [`conformite/conditions-api-deezer.md`](conformite/conditions-api-deezer.md) |
| RGPD : ce qui est en place | [`conformite/rgpd.md`](conformite/rgpd.md) |
| **Historique** | |
| L'histoire du projet (refonte, anciens modèles et prototypes de la Survie) | [`historique/README.md`](historique/README.md) |

Avant une nouvelle fonctionnalité : [`CLAUDE.md`](../CLAUDE.md), [`architecture/decisions.md`](architecture/decisions.md), puis [`taches.md`](taches.md).
