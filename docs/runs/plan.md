# Run (Platines) : plan

Feuille de route du mode, idées pour la suite et historique des décisions. Le découpage en PR du proto 1, livré, est dans [`../historique/runs-proto1-decoupage.md`](../historique/runs-proto1-decoupage.md). Règles : [`regles.md`](regles.md). Écrans : [`ecrans.md`](ecrans.md). Conception : [`conception.md`](conception.md).

## Feuille de route

La feuille de route décidée le 17/10/2026 peut encore changer.

1. **Étape 0, règles et maquettes** : faite le 17/10/2026 (ce dossier).
2. **Proto 1, la boucle sans bonus** ([#360](https://github.com/Oasis35/InSeconds/issues/360)), **livré le 27/10/2026** (sur invitation) :
   - 4 manches de 5 morceaux, écoute fixe de 10 s, jauge par manche, réponse après chaque morceau ;
   - disques, record perso, playlist partagée par lien avec comparaison ;
   - ouvert sur invitation seulement, entrée par une carte sur l'accueil.

   Le code prévoit la place des bonus sans en livrer aucun. Le but est de savoir si c'est amusant et de régler les seuils et la difficulté.
3. **Proto 2, les coups de pouce** : une seule famille de bonus, à usage unique sur le morceau en cours. Une offre de 1 parmi 3 en fin de manche.
4. **Proto 3 et suivants** : les autres familles de bonus, une par une. D'abord les atouts, le choix de la manche suivante, les contraintes et la manche boss, les pactes. Ensuite la rareté et les déblocages.
5. **Ouverture** :
   - accès pour tous ;
   - partage du résultat sur les réseaux ;
   - statistiques dans l'admin ;
   - un accueil qui laisse choisir le mode.
6. **Plus tard** :
   - genre (depuis l'album Deezer) et étiquettes de thème dans le catalogue ;
   - thèmes de run ;
   - difficulté mixte : rang Deezer, puis taux de réussite réel dès qu'un morceau a assez de réponses (environ 30) ;
   - fantôme : le parcours de l'ami affiché pendant la partie ;
   - mode infini, avec les disques au-delà de l'or.

Chaque étape a un ticket parent et quelques PR vers `env/staging`. Les traductions, les E2E et la doc arrivent dès le proto 1.

## Après le proto 1

Le proto 1 est livré (son découpage en PR : [`../historique/runs-proto1-decoupage.md`](../historique/runs-proto1-decoupage.md)). La suite : Clément organise des parties de test sur le staging, puis en prod avec quelques comptes, et règle ensuite les seuils et la difficulté avant le proto 2. Les petites suites du proto 1 (panneaux Grafana, synchronisation entre onglets, captures réelles) sont dans [`../taches.md`](../taches.md).

## Bonus et contraintes (idées pour le proto 2 et après)

Proposition du 17/10/2026, à itérer. Elle n'est pas dans le proto 1.

### Structure, calquée sur Balatro
| Famille | Équivalent Balatro | Durée | Emplacements |
|---|---|---|---|
| **Atouts** | jokers | passifs, toute la partie | 3 |
| **Coups de pouce** | cartes tarot | usage unique, sur le morceau en cours | 2 |
| **Choix de la manche** | choix du blind / des packs | s'applique à la manche suivante | - |
| **Contraintes** | blinds boss | imposées (manche boss) ou acceptées contre une récompense (pactes) | - |

- **Gagner un bonus** : en fin de manche, le joueur choisit **1 offre parmi 3**, ou refuse. Dépasser largement la jauge donne des offres plus rares.
- **Emplacements pleins** : le joueur remplace un bonus ou refuse l'offre. C'est ce qui l'oblige à composer un jeu.
- **Rareté** : commun, rare, légendaire. Les bonus rares et légendaires se débloquent au fil des parties (finir un run, finir sans coup de pouce…), après le prototype des bonus.

### Exemples par famille
- **Coups de pouce**, à usage unique :
  - Écoute : 15 s, l'extrait entier de 30 s, démarrer au milieu de l'extrait.
  - Indices : genre, année, nom de l'album, pochette floue, première lettre, nombre de mots du titre, 3 propositions au choix.
  - Tirage : changer de morceau.
  - Survie : un morceau raté compte comme à moitié trouvé.
- **Atouts**, passifs :
  - Spécialiste : un genre choisi rapporte ×2.
  - Mélomane : le titre vaut double.
  - Sans filet : +50 % sur un morceau trouvé sans coup de pouce.
  - En série : +10 % par bonne réponse d'affilée.
  - Oreille fine : +2 s d'écoute.
  - Seconde chance : une manche ratée de peu est repêchée une fois.
- **Choix de la manche suivante** :
  - genre, thème, décennie ou artiste des 5 morceaux ;
  - manche courte : 3 morceaux au lieu de 5 ;
  - manche facile : des morceaux plus connus, points ×0,5.
- **Contraintes** :
  - Manche boss, la 4e : écoute de 5 s, titre seulement, sans autocomplétion, morceaux plus durs ou jauge +10 %.
  - Pactes : une contrainte acceptée contre une récompense (points ×2, offre rare).
  - Limiter les réécoutes est aussi un malus possible.

Pour le prototype des bonus : une douzaine de bonus communs, sans rareté ni déblocage (5 coups de pouce, 4 atouts, 3 choix de manche), plus la manche boss. Les pactes et la méta-progression viendront ensuite. Côté code, les bonus décorent `IRunScoringPolicy` et modifient `RunRules` ([`conception.md`](conception.md) § 7).

## Historique des décisions

- **Réflexion de septembre 2026** : Clément a regardé Bandle, blindtest.gg et What the Tune, puis écarté le multijoueur en temps réel.
  - Il a retenu un mode solo inspiré de **Balatro** : la difficulté monte tous les 5 morceaux, avec un seuil à atteindre par palier.
  - L'écoute est fixe, les bonus ont des emplacements limités, des thèmes filtrent le tirage.
  - On partage une graine avec un fantôme. Le compte n'est jamais obligatoire.
- **Place du mode dans l'architecture** :
  - le mode a son module back `Runs` et son domaine front `runs/` ; un mode ne voit jamais l'autre ;
  - rien de Runs n'est créé avant le mode lui-même ;
  - le mode passe par `TrackRound` (Gameplay) et ses métadonnées vont dans Catalogue.
- **17/10/2026, décisions de Clément** :
  - fin de partie par seuil de points par manche, rater un morceau ne termine rien ;
  - victoire au bout de 4 manches ;
  - écoute fixe de 10 s, pool commun avec le Daily ;
  - points = (50 + 50) × difficulté, runs illimités ;
  - nom affiché « Platines », paliers en disques inventés ;
  - accès sur invitation, playlist partagée par lien avec comparaison et sans classement ;
  - morceau sans extrait neutralisé, partie à l'honneur sans chrono ;
  - entrée par une carte sur l'accueil (option A).
- **17/10/2026, revue indépendante du plan** (hors dépôt). Elle a apporté :
  - les codes d'erreur et les routes alignés sur le Daily, avec son vocabulaire (« défi », « partie ») ;
  - le lien par code court et la comparaison au lieu d'un « classement » ;
  - l'usage des morceaux déclaré par chaque mode et le contrôle nocturne de tout le pool, puis le pool admin général avec une vue par mode ;
  - un nouvel ordre des PR ([`../historique/runs-proto1-decoupage.md`](../historique/runs-proto1-decoupage.md)).
- **17/10/2026, maquettes validées** : elles font référence ([`ecrans.md`](ecrans.md)).
  - Après chaque morceau, la réponse s'affiche dans l'écran de manche avec « Morceau suivant ».
  - Le lecteur, la saisie, le lien « Abandonner », la forme de pochette et la liste « déjà joué » sont repris du Daily.
  - Le multiplicateur n'est pas affiché.
  - La fin de run se fait sans « Voir les morceaux ».
  - La comparaison s'intitule « N joueurs de cette playlist ».
