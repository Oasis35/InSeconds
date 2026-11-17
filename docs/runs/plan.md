# Setlist : plan

Ce qui reste pour le mode, les idées pour la suite et les décisions. Règles : [`regles.md`](regles.md). Écrans : [`ecrans.md`](ecrans.md). Conception : [`conception.md`](conception.md). L'histoire du mode (proto 1 à 3, ancien modèle à jauge, difficultés et cartes) est archivée dans [`../historique/runs-ancien-modele/`](../historique/runs-ancien-modele/) et [`../historique/runs-proto1-decoupage.md`](../historique/runs-proto1-decoupage.md).

## Où on en est

- **La Série** (règles de novembre 2026) est livrée sur le staging : vies, manches sans fin, paliers d'écoute, thème par manche, fantôme et duels, Hits. Elle remplace l'ancien modèle ; la migration `SerieRules` a vidé les parties de l'ancien mode.
- **La V4** (barre du bas, accueil, historique, niveau, groupes, classement) : [`proto4.md`](proto4.md).
- **Mesure** : compteurs de parties, de manches par issue de palier, de duels et de niveaux (rangée « Setlist » du tableau Grafana « Activité »).

## Reste à faire

1. **Parties de test et réglage** : barème des paliers, échelle d'écoute, nombre de tranches de rang, et **barème des disques de niveau** (le score n'est plus borné, les seuils actuels ont été pensés pour l'ancien modèle ; fil séparé niveau et ELO).
2. **Catalogue épuisé** : cas rare où le tirage d'une manche ne trouve plus assez de morceaux libres (500 à ce jour), à traiter proprement.
3. **Ouverture** : accès pour tous, un accueil qui laisse choisir le mode, statistiques du mode dans l'admin.

## Idées pour la suite (rien n'est décidé)

- Contraintes ou événements ponctuels sur une manche (écoute plus courte, thème imposé).
- Difficulté mixte : rang Deezer puis taux de réussite réel d'un morceau dès qu'il a assez de réponses (environ 30).
- Défis hebdomadaires ou saisons du niveau.

**Ne pas reproposer** (retirés par Clément lors de la refonte) : objectifs de manche et jauge, difficultés à choisir, boss, multiplicateurs, cartes et Échange, réserve de morceaux, « PR 4 » des bonus.

## Historique des décisions

- **Septembre 2026** : Clément a regardé Bandle, blindtest.gg et What the Tune, puis écarté le multijoueur en temps réel au profit d'un mode solo avec une graine partagée et un fantôme ; le compte n'est jamais obligatoire.
- **17/10/2026** : mode séparé (module `Runs`, domaine front `runs/`), pool commun avec le Daily, playlist partagée par lien avec comparaison et sans classement, accès sur invitation, nom « Setlist ».
- **27/10/2026** : proto 1 livré (4 manches, jauge). **03/11** : chrono de 45 s par morceau, écran de jeu en pile.
- **Novembre 2026** : protos 2 et 3 (difficultés, cartes, Échange), puis la V4 ([`proto4.md`](proto4.md)).
- **16/11/2026, refonte « la Série »** : plus de fin fixée ni de jauge ; 3 vies, manches de 5 morceaux sans fin, de moins en moins connus, écoute qui raccourcit après une manche sans erreur et rallonge après une erreur, points par palier, thème par manche, fantôme qui continue après le score figé de l'ami. Supprimés : objectifs, difficultés, boss, multiplicateurs, cartes, Échange, réserve. Le chrono de 45 s et le vocabulaire « Manche » sont gardés. Les bonus (ex-PR 4) sont retirés du plan.
- **16/11/2026, suite** : la migration destructive `SerieRules` est validée par Clément ; cinq Hits s'ajoutent (Oreille d'or, Sans une égratignure, Marathon, Mystère résolu, Fantôme battu en retard).
- **17/11/2026, équilibrage de la Série** (décidé par Clément après des parties de test et des simulations : trop dur, trop long) : manches de **3 morceaux**, 3 vies, chrono 45 s gardé ; **une vie regagnée** à chaque manche sans vie perdue ; l'écoute **raccourcit dès qu'une manche se termine sans vie perdue** (une moitié juste ne gêne plus) ; **plafond de 8 manches** (« Série complète ») ; bonus de **250 points par vie restante** et **500 points** de complétion, sans départage des égalités ; règles figées dans la playlist (les anciennes gardent les leurs). Visé : 6 à 8 minutes pour un joueur moyen, à mesurer sur parties de test ; seuils des disques (Bronze 700 à Diamant 3 400) à recaler sur parties réelles (maximum théorique sur 8 manches : 16 800 points, plus 1 250 de bonus). La variante « Hardcore » (le dégradé complet de 10 s à 0,5 s à chaque manche) est écartée du mode principal, elle pourra revenir comme variante à part.
