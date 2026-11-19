# Survie : plan

Ce qui reste pour le mode et les idées pour la suite. Règles : [`regles.md`](regles.md). Écrans : [`ecrans.md`](ecrans.md). Conception : [`conception.md`](conception.md). Les chantiers terminés du mode (ancien modèle, proto 1, proto 4, niveau et classement) sont archivés dans [`../historique/`](../historique/README.md).

## Où on en est

- **La Série** (vies, manches de 3 morceaux, plafond de 8 manches, paliers d'écoute, thème par manche, fantôme et duels, Hits) et **l'interface Survie** (barre du bas, accueil à deux cartes, historique, niveau et disques, groupes, classement général) sont sur le staging, sur invitation.
- **Mesure** : compteurs de parties, de manches par issue de palier, de duels, de niveaux, de groupes et de noms choisis au classement (rangée « Survie » du tableau Grafana « Activité »).

## Reste à faire

1. **Parties de test et réglage** : le barème des paliers (`Runs:StepPoints`), l'échelle d'écoute (`Runs:ListenLadder`), le nombre de tranches de rang (`Runs:RankBands`) et les seuils des disques de niveau (`Runs:Levels:Discs`), à recaler sur des parties de testeurs ; viser 6 à 8 minutes par partie pour un joueur moyen.
2. **Catalogue épuisé** : quand le tirage d'une manche ne trouve plus assez de morceaux libres, l'API répond une 500. Cas rare, à traiter proprement.
3. **Ouverture à tous** : accès sans invitation, statistiques du mode dans l'admin, et pour le classement général ce qui a été reporté à ce moment-là : un mode « Masqué », le masquage après 12 mois d'inactivité, un bandeau d'information et une nouvelle balance des intérêts ([`../conformite/rgpd.md`](../conformite/rgpd.md)). Les anciens écrans de l'interface publique se retirent quand tout le monde a basculé.
4. **Textes du lien d'un ami** : le bloc de règles dit encore « sans fin » alors que la partie s'arrête à la 8e manche.

## Idées pour la suite (rien n'est décidé)

- Onglet « Cette semaine » dans les groupes.
- Animation et Hit au passage d'un disque.
- Nouveau visuel du disque rayé.
- Compte à rebours « plus que 6 h » du défi du jour sur l'accueil, Instagram dans l'en-tête du mode.
- Contraintes ou événements ponctuels sur une manche (écoute plus courte, thème imposé).
- Difficulté mixte : rang Deezer puis taux de réussite réel d'un morceau dès qu'il a assez de réponses (environ 30).
- Défis hebdomadaires ou saisons du niveau.
- Une variante « Hardcore » à part (le dégradé complet de 10 s à 0,5 s à chaque manche), hors du mode principal.

## Ne pas reproposer

Retirés lors de la refonte du mode : objectifs de manche et jauge, difficultés à choisir, boss, multiplicateurs, cartes et Échange, réserve de morceaux, bonus de cartes ; le multijoueur en temps réel (le mode est solo, avec une graine partagée et un fantôme) ; un vrai Elo pour le niveau ; un classement général par meilleur score.
