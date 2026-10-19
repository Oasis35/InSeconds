# La refonte de 2026 (v1 → v2)

Chantier terminé : ces documents sont **figés** et ne décrivent plus forcément le code. La référence est le [`CLAUDE.md`](../../../CLAUDE.md) racine et ses deux compagnons ([`src/back/CLAUDE.md`](../../../src/back/CLAUDE.md), [`src/front/CLAUDE.md`](../../../src/front/CLAUDE.md)). Les mots « v1 » et « v2 » ne servent plus qu'ici.

## En bref

- **Pourquoi** : la v1 (vertical slices, une seule API sans frontières) devenait difficile à faire évoluer ; la refonte a posé un monolithe modulaire (Players, Catalogue, Gameplay, Daily), des frontières vérifiées par des tests (NetArchTest côté back, Sheriff côté front), Wolverine (endpoints, transactions, outbox), Hangfire et NgRx SignalStore.
- **Comment** : la v2 a été construite à côté de la v1 (`src/v2`), dans la même base avec un schéma par module, testée sur le staging avec un import répété des données de la prod, puis basculée d'un coup.
- **Quand** : plan rédigé le 29 et le 30/09/2026, première PR (A1, #204) le 30/09, **mise en prod le 16/10/2026 à 07:43 UTC** (workflow « Bascule v2 », supprimé depuis), nettoyage le jour même (I1 #343 : routes en 410 retirées, script de suppression des tables v1 ; I2 #344 et #345 : code v1 supprimé, `src/v2` → `src`, import retiré). Tables v1 supprimées au staging le 16/10 et en prod le 19/10/2026 (après l'archive R2 `archive/inseconds-2026-10-19T094004Z.dump`, #235 fermé), puis merge `env/staging` → `main` le 19/10 (#370).
- **Reste** : I3 (#237, vers le 14/01/2027) : retrait de `legacy_tokens`, du middleware de reprise des cookies v1 et des anciennes clés Data Protection non chiffrées.
- **Suivi** : ticket parent #205 et ses sous-tickets (étiquette `refonte-v2`).

## La bascule du 16/10/2026

Workflow manuel « Bascule v2 » (`bascule-v2.yml`, retiré en I1 avec `deploy/vps/switch-to-v2.sh` ; l'import `deploy/migration-v2/` est retiré en I2, tout reste dans l'historique git). Il préparait sans arrêt (certificat Data Protection, image, migrations), arrêtait l'API v1, importait les données, créait une clé Data Protection neuve, figeait l'historique des statistiques, remplaçait les conteneurs par la v2 sous les mêmes noms (Caddy inchangé), vérifiait la santé puis ouvrait le jeu. Au moindre écart avant l'ouverture, la v1 repartait, ses tables n'ayant jamais été modifiées. Répétée sur le staging le 12/10 (retour arrière simulé et deux passages réels, jalon J5).

En prod : run #5, vert à 07:43 UTC, environ 1 min 30. La première tentative s'est arrêtée en préparation, avant l'arrêt de la v1 : `secrets/dataprotection.pfx` n'était pas lisible par l'uid/gid 1654 de l'image (`sudo chgrp 1654 … && sudo chmod 640 …`, cf. `.env.prod.example`). Après la bascule, les routes de la v1 ont répondu `410 common.new_version` jusqu'à I1. Suivi : #234.

## Les documents

| Fichier | Contenu |
|---|---|
| [`PLAN.md`](PLAN.md) | le « quoi » : objectifs, décisions, modèle de données, back, front, reprise des données, bascule, sécurité, risques. Le § 7 (mode Runs) reste la base du prochain mode de jeu. |
| [`DEVELOPPEMENT.md`](DEVELOPPEMENT.md) | le « comment » : découpage en une trentaine de PR (phases A à I), ce qui a été fait et décidé à chaque étape |

Les décisions encore valables sont reprises dans [`docs/architecture/decisions.md`](../../architecture/decisions.md). Les brouillons du 29/09 et les revues de chaque PR sont restés dans le dossier partagé du projet (`audit/`).
