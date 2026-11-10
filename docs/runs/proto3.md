# Platines proto 3 : plus simple, plus ludique, plus viral

Le proto 3 ([#531](https://github.com/Oasis35/InSeconds/issues/531)) simplifie le mode pour qu'un joueur occasionnel le comprenne sans explication, tout en gardant de la profondeur pour un fan de blind tests. Il se livre en **3 PR** vers `env/staging`, chacune testée au staging avant la suivante. Les chiffres des difficultés et des cartes sont des hypothèses, à régler aux parties de test.

## Ce qui est décidé

- **Un seul choix par palier : la difficulté.** Les quatre manches restent.
- **Difficultés Facile, Normal, Mélomane** (anciennement Facile, Sûre, Risquée : seuls les libellés changent, le code garde `easy`, `safe`, `risky`). Chaque colonne montre l'objectif en points et **ce qu'un morceau rapporte au plus** ; plus de plafond de manche, de « max » ni de total atteignable à l'écran. Mélomane rapporte plus de points au total (le facteur de points reste dans les règles figées, il ne s'affiche plus en multiplicateur). **Normal est présélectionné**, « Jouer » lance la manche.
- **Le palier et la difficulté tiennent sur un seul écran** (la manche suivante en trois colonnes, puis « Jouer »).
- **Retour « objectif atteint »** pendant la manche : un ✓ et un petit temps fort quand l'objectif est franchi.
- **Le Joker disparaît**, remplacé par l'Échange offert (« Changer de morceau », un par manche, non cumulable) : PR 2.
- **Cartes réduites à 3** (QCM, Prolongation, Indice), **gagnées** quand une manche dépasse l'objectif de 25 % (au lieu d'une offre 1 parmi 3) ; anciennes playlists purgées : PR 2.
- **Fin de run** : duel avec l'ami en tête, fantôme dès le premier morceau, Revanche : PR 3.
- Plus tard, à part : ouverture de la création de playlists et aperçu de lien ([#535](https://github.com/Oasis35/InSeconds/issues/535)), genre saisi par l'admin puis thèmes ([#536](https://github.com/Oasis35/InSeconds/issues/536)), idées virales ([#537](https://github.com/Oasis35/InSeconds/issues/537)).

## PR 1 ([#532](https://github.com/Oasis35/InSeconds/issues/532)) : ce qui change à l'écran

- Libellés `runs.difficulty.*` (FR et EN), partout où ils s'affichent : colonnes, ligne de partage (« Manche 1 · Normal »).
- Composant `run-difficulty-columns` : les trois colonnes, partagées par l'écran de palier (playlist à coups de pouce : tout est sur le palier, le bouton du bas est « Jouer ») et par l'écran « Difficulté ? » (playlist sans coups de pouce, qui garde son écran et son bouton « Jouer »).
- `RunGameStore.chooseDifficulty` accepte l'écran de palier ; l'offre de cartes encore ouverte est fermée par le serveur au choix (`RunSession.ChooseDifficulty`), rien ne change côté API.
- En-tête de manche : « ✓ objectif atteint » et son petit temps fort au franchissement.
- Les cartes (offre de 3, main de 2) restent telles quelles jusqu'à la PR 2.

Ce que vaut au plus un morceau (`perTrack`) se calcule dans le front : le plafond de la manche (`maxScore`) divisé par les morceaux de la manche (`tracksPerRound`).
