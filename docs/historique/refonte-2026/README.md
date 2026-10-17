# La refonte de 2026 (v1 → v2)

Chantier terminé : ces documents sont **figés** et ne décrivent plus forcément le code. La référence est le [`CLAUDE.md`](../../../CLAUDE.md) racine et ses deux compagnons ([`src/back/CLAUDE.md`](../../../src/back/CLAUDE.md), [`src/front/CLAUDE.md`](../../../src/front/CLAUDE.md)). Les mots « v1 » et « v2 » ne servent plus qu'ici.

## En bref

- **Pourquoi** : la v1 (vertical slices, une seule API sans frontières) devenait difficile à faire évoluer ; la refonte a posé un monolithe modulaire (Players, Catalogue, Gameplay, Daily), des frontières vérifiées par des tests (NetArchTest côté back, Sheriff côté front), Wolverine (endpoints, transactions, outbox), Hangfire et NgRx SignalStore.
- **Comment** : la v2 a été construite à côté de la v1 (`src/v2`), dans la même base avec un schéma par module, testée sur le staging avec un import répété des données de la prod, puis basculée d'un coup.
- **Quand** : plan rédigé le 29 et le 30/09/2026, première PR (A1, #204) le 30/09, **mise en prod le 16/10/2026 à 07:43 UTC** (workflow « Bascule v2 », supprimé depuis), nettoyage le jour même (I1 #343 : tables v1 et routes en 410 ; I2 #344 et #345 : code v1 supprimé, `src/v2` → `src`, import retiré).
- **Reste** : I3 (#237, vers le 14/01/2027) : retrait de `legacy_tokens`, du middleware de reprise des cookies v1 et des anciennes clés Data Protection non chiffrées.
- **Suivi** : ticket parent #205 et ses sous-tickets (étiquette `refonte-v2`).

## Les documents

| Fichier | Contenu |
|---|---|
| [`PLAN.md`](PLAN.md) | le « quoi » : objectifs, décisions, modèle de données, back, front, reprise des données, bascule, sécurité, risques. Le § 7 (mode Runs) reste la base du prochain mode de jeu. |
| [`DEVELOPPEMENT.md`](DEVELOPPEMENT.md) | le « comment » : découpage en une trentaine de PR (phases A à I), ce qui a été fait et décidé à chaque étape |

Les décisions encore valables sont reprises dans [`docs/architecture/decisions.md`](../../architecture/decisions.md). Les brouillons du 29/09 et les revues de chaque PR sont restés dans le dossier partagé du projet (`audit/`).
