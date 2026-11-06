# Run (Platines) : proto 2, palier, difficulté et coups de pouce

Règles et écrans du proto 2, décidés avec Clément le 05/11/2026. **En cours de livraison sur le staging** : le back des difficultés et de la réserve du Joker ([#498](https://github.com/Oasis35/InSeconds/issues/498)) et celui des coups de pouce ([#499](https://github.com/Oasis35/InSeconds/issues/499)) sont faits, ainsi que l'écran de palier ([#500](https://github.com/Oasis35/InSeconds/issues/500)) et l'écran « Difficulté ? » ([#501](https://github.com/Oasis35/InSeconds/issues/501)), le reste suit ticket par ticket ; le proto 1 ([`regles.md`](regles.md)) reste la référence de ce qui tourne en prod. Les chiffres marqués « provisoire » se règlent après les parties de test. Maquette interactive : artifact « Platines, palier et pari » sur claude.ai (privé) ; les captures de [`maquettes/`](maquettes/) (`proto2-*.png`) en sont tirées le 05/11/2026. Plan et tickets : [`plan.md`](plan.md).

## Ce que le proto 2 change

Le proto 1 enchaîne 4 manches sans choix. Le proto 2 ajoute, entre deux manches, un **moment de jeu** : le joueur voit ce qu'il a gagné, choisit un coup de pouce, puis **mise sur la difficulté** de la manche suivante. Le but est que le run soit rejouable, partageable et qu'il donne envie d'« encore une manche ».

Trois idées, rien d'autre :

1. un **écran de palier** après chaque manche passée ([#500](https://github.com/Oasis35/InSeconds/issues/500)) ;
2. un **choix de difficulté** (Facile, Sûre, Risquée) qui fixe l'objectif et le plafond de points de la manche ([#498](https://github.com/Oasis35/InSeconds/issues/498) côté back, [#501](https://github.com/Oasis35/InSeconds/issues/501) pour l'écran) ;
3. des **coups de pouce** (cartes), 2 en main, à jouer sur un morceau ([#499](https://github.com/Oasis35/InSeconds/issues/499) côté back, [#502](https://github.com/Oasis35/InSeconds/issues/502) sur l'écran de manche).

Ce que le proto 2 ne fait pas : atouts passifs, contraintes, pactes, rareté, déblocages, run éclair, thèmes (cf. [`plan.md`](plan.md) § Bonus).

## Le déroulé

1. Dernier morceau de la manche : la carte rejoint la pile, la ligne de palier se pose (comme aujourd'hui).
2. **Écran de palier** (si la manche est passée) : le disque gagné, le score, l'objectif de la manche suivante, trois cartes à prendre, la main du joueur, « Suite ».
3. **Écran « Difficulté ? »** : trois colonnes, les bonus de la main en bas. Toucher une colonne lance le premier morceau de la manche, au même toucher : le son est déverrouillé dans le toucher, l'extrait arrive avec la réponse au choix (rien du morceau ne part avant, pour qu'on ne mise pas en le connaissant) et se lance aussitôt, comme « Commencer » (iPhone).
4. La manche se joue avec les cartes de la main au-dessus du champ de saisie.
5. Jauge non remplie à la fin de la manche : **fin du run**, comme au proto 1. Pas d'écran de palier, on va à la fin.

La première manche n'a ni palier ni choix de difficulté : le run démarre comme aujourd'hui, avec une carte offerte en main.

## L'écran de palier

Du haut vers le bas, sans phrase d'explication :

- la barre du run (4 segments), le numéro de la manche passée ;
- le **disque gagné**, grand, son nom, et l'étagère des disques de l'échelle (le suivant en pointillé) ;
- le **score** du run avec sa jauge et le repère de l'objectif franchi ;
- « Manche 2 » et l'objectif suivant en gros (« 333 pts pour » + le disque visé) ;
- **trois cartes** à toucher (icône et nom seulement) et « Passer » en lien : le joueur en prend une ou refuse ;
- la **main** (2 emplacements) ;
- « Suite ».

Le disque se pose, le score monte jusqu'au repère, les cartes arrivent une à une : animations GSAP par la façade `ui/motion`, rien entre le toucher et `play()` (pièges 44 et 46), `prefers-reduced-motion` respecté.

![Écran de palier](maquettes/proto2-palier.png)

## La difficulté de la manche

Trois colonnes à plat sur une base commune, hauteur proportionnelle au **plafond de points** de la manche, avec en pointillé l'**objectif** : un cadenas et son chiffre posés sur la frontière, la zone dessous assombrie. Titre « Difficulté ? », « Ton score » en haut, le total atteignable (« → 1250 ») sous chaque plafond, les bonus en main en bas. Aucune colonne n'est présélectionnée.

![Écran « Difficulté ? »](maquettes/proto2-difficulte.png)

| Difficulté | Objectif (provisoire) | Plafond de la manche (provisoire) |
|---|---|---|
| Facile | 200 | 500 |
| Sûre | 333 | 750 |
| Risquée | 500 | 1 000 |

Règles :

- **Objectif non atteint à la fin de la manche : fin du run**, quelle que soit la difficulté. C'est la mise.
- Les points de chaque morceau sont **mis à l'échelle de la difficulté choisie** : le plafond de la colonne est le maximum de la manche avec ce facteur. Réglages livrés (provisoires, `Runs:Difficulties`) : Facile ×0,67 des points pour 60 % de l'objectif de Sûre, Risquée ×1,33 pour 150 %. Dépasser l'objectif est utile : seul le plafond limite le score, et une difficulté plus haute rapporte plus pour la même qualité de réponse.
- **Jamais de points acquis retirés** : rien ne se multiplie sur le total du run.
- Les plafonds ne se chevauchent presque pas : pour dépasser le plafond de Facile il faut s'engager sur une difficulté plus haute.
- L'objectif de « Sûre » est celui du proto 1 pour la manche (seuils de départ ci-dessous). Facile et Risquée sont des fractions et des multiples de ce seuil, à régler.
- **Dernière manche** : « Risquée » est la **manche boss** (écoute de 5 s). Elle n'est jamais imposée. À confirmer après les parties de test, pour ne pas braquer les débutants.
- **Sans choix**, la manche se joue en « Sûre » (rien n'est noté dans la partie). Le choix reste ouvert jusqu'au premier son de la manche, jamais après, et l'extrait de son premier morceau ne part qu'avec lui. Les réglages refusent un objectif au-dessus du plafond de sa difficulté.
- **Seuils de départ** (`Runs:ThresholdPercents`) : 45, 55, 65, 75 % du maximum de la manche (au lieu de 40, 50, 60, 70), à ajuster après les parties de test. Les anciennes playlists gardent leurs règles figées.

Questions à trancher avec les parties de test : barème exact des trois colonnes, facteurs de points, objectif de Facile (reste-t-il proche de Sûre ?), boss à 5 s.

## Les coups de pouce

Des cartes à **usage unique**, jouées sur le morceau en cours. **2 emplacements en main**. Le joueur en reçoit **une au départ du run** et peut en prendre **une parmi 3** à chaque palier (ou aucune). Main pleine : il touche la carte à lâcher, ou refuse l'offre.

| Carte | Effet (provisoire) |
|---|---|
| Trois choix | l'autocomplétion est remplacée par trois réponses, une seule est juste |
| Joker | change de morceau |
| Année | affiche l'année du morceau |
| Initiales | affiche les initiales de l'artiste et du titre |
| Rallonge | 20 s d'écoute au lieu de 10 |
| Filet | un morceau raté compte comme à moitié trouvé |
| Seuil abaissé | l'objectif de la manche baisse de 20 % (gardée pour la manche, pas pour un morceau) |
| Sablier | 30 s de plus au chrono de 45 s (retenu le 05/11/2026 plutôt que le chrono suspendu, réglable par `Runs:HourglassSeconds`) |

- Les **offres sont les mêmes pour tous les joueurs de la playlist** et figées avec elle : la comparaison reste juste.
- **Rien d'une carte n'identifie un morceau avant la réponse** (piège 31) : « Année » et « Initiales » sont servies par le serveur à l'activation, jamais envoyées d'avance. « Trois choix » : les deux fausses réponses viennent du serveur, qui ne dit pas laquelle est juste.
- Sur l'écran de manche, les cartes sont **au-dessus du champ de saisie** ; « Passer (0 pts) » reste un simple lien souligné sous « Valider ».
- Une carte jouée monte dans la carte du morceau (animation), avec ce qu'elle révèle (l'année, les initiales, les secondes ajoutées) ; le serveur en tient le compte (une carte ne se joue qu'une fois). « Trois choix » remplace le champ et « Valider » par les trois réponses à toucher ; « Rallonge » relance l'écoute sur 20 s ; un Joker passe au morceau de réserve, écoute et chrono remis à zéro.
- Côté serveur : une même carte ne se joue qu'une fois par morceau (« Seuil abaissé » une fois par manche) ; un Joker sort le morceau suivant de la réserve de la manche, remet l'écoute et le chrono à zéro, et efface les cartes déjà jouées sur l'ancien morceau ; « Trois choix » propose deux morceaux du catalogue hors de la playlist, d'autres artistes, les mêmes pour tous les joueurs ; « Filet » donne les points d'un morceau à moitié trouvé sans changer les verdicts (le partage montre toujours un morceau raté). L'offre d'un palier reste ouverte jusqu'à ce qu'une carte soit prise, que le joueur la passe, ou qu'il choisisse la difficulté ; tant qu'elle est ouverte, rien du premier morceau de la manche ne part. Jouer une carte ferme aussi le choix de la difficulté. Une carte qui n'aurait rien à changer ne se joue pas (Joker sans réserve, Année inconnue, Trois choix sans deux leurres, Sablier sans chrono ou après le chrono). « Rallonge » donne 20 s d'écoute même dans la manche boss ; « Filet » puis « Passer » rapporte les points d'un morceau à moitié trouvé (c'est un morceau raté), jamais une réponse en retard.

![Manche 2 avec les cartes en main](maquettes/proto2-manche-cartes.png)

## Fin du run, partage et viralité

- **Rejouer** devient l'action principale de l'écran de fin, avec ce qui a manqué (« Il t'a manqué 12 pts pour le Disque de bronze » : les points qui manquaient à l'objectif de la manche ratée ; rien pour une partie gagnée ou abandonnée).
- **Partage en grille** : une ligne d'emojis par manche (trouvé, à moitié, raté, comme le partage du Daily) avec la difficulté choisie, le disque, le score et le lien `?utm_source=share`, plus une invitation « Bats-moi » vers la même playlist. Le score et le disque d'abord, pour qu'ils se lisent dans l'aperçu d'une conversation :

  ```
  2 410 pts · Disque d'argent · InSeconds Platines
  🟩🟨🟥⬜🟩 Manche 1 · Sûre
  🟩🟩🟩🟩🟨 Manche 2 · Risquée
  🟨🟥🟩🟥🟥 Manche 3 · Facile
  Bats-moi sur la même playlist :
  https://inseconds.cc/runs/K7Q2M9?utm_source=share
  ```

  🟩 trouvé (artiste et titre), 🟨 à moitié, 🟥 raté, ⬜ morceau retiré ; seules les manches jouées ont leur ligne, et rien n'y identifie un morceau.
- **Fantôme** : seulement celui d'un **ami sur la même playlist** (par son lien) : l'écart avec lui à chaque morceau. Il n'y a pas de fantôme de son propre record (Clément, 05/11). L'ami est l'auteur de la playlist, s'il l'a finie (gagnée ou perdue) ; sous « Total du run », son pseudo et son total au même morceau en violet, puis « 60 pts d'avance », « 40 pts de retard » ou « À égalité ». Le serveur n'envoie son total que sur les morceaux que le joueur a joués (un morceau retiré au joueur ne compte pas), jusqu'au dernier répondu, jamais d'avance ; un ami dépassé est marqué « arrêt en manche 2 ».
- **Combo visuel** : série de bonnes réponses affichée, sans aucun point (« 3 d'affilée » à côté de « Total du run », en orange, dès deux bonnes réponses ; un morceau retiré ne la casse pas, un morceau raté ou à moitié trouvé la remet à zéro).
- **Sons d'interface** : sons à nous, libres de droits, jamais pendant un extrait, avec un bouton pour les couper. Tous synthétisés dans le navigateur (aucun fichier) : le tic des dernières secondes, deux notes qui montent pour une manche passée, un déclic pour une carte prise, un petit arpège pour un run gagné, deux notes qui descendent pour un run perdu. Le bouton (un haut-parleur) est à droite de la barre du run ; ce navigateur retient le choix.
- Étagère des disques gagnés sur l'accueil du mode (« Tes disques » : chaque disque et son nombre ; une partie sans manche passée ou abandonnée n'en pose pas).

## Ce que cela change côté code

Les noms exacts viendront de la conception ([`conception.md`](conception.md) § 7 prévoit déjà que les bonus décorent `IRunScoringPolicy` et modifient `RunRules`).

- **Règles figées dans la playlist** : les trois difficultés de chaque manche (objectif, plafond, facteur de points), les offres de cartes de chaque palier et la carte de départ sont tirées **à la création** et enregistrées avec la playlist (`rules` en `jsonb` et colonnes de tirage). Les playlists existantes n'ont pas ces champs : elles se jouent comme au proto 1, sans palier ni choix.
- **Tirage** : pour la même manche, les trois difficultés peuvent tirer des morceaux de tranches de rang Deezer voisines ; chaque manche a ses morceaux principaux et une réserve pour « Joker ». Tout est enregistré à la création (même playlist pour tous).
- **La partie** retient, par manche, la difficulté choisie, les cartes prises, lâchées et jouées, et les morceaux remplacés par un Joker. Aucune nouvelle donnée de joueur hors de la partie (l'effacement du joueur la couvre déjà, piège 48).
- **Calcul des points** : côté serveur uniquement ; la difficulté et chaque carte sont des décorateurs de la politique de score ou des modificateurs des règles de la manche. Le client ne propose jamais de score.
- **Routes** : choix de la difficulté (qui démarre le morceau), prise d'une carte, jeu d'une carte, lâcher une carte ; erreurs en ProblemDetails avec codes stables `runs.*`.
- **Front** (domaine `runs/`) : écran de palier, écran de difficulté, main, cartes au-dessus du champ, grille de partage ; textes FR/EN ; animations par `ui/motion`.
- **Mesure** : compteurs par difficulté choisie, par carte prise et jouée, et part des runs perdus à l'objectif (`RunsMetrics`, tableau Grafana « Activité »).
- **Tests** : unitaires des politiques de score et des cartes, intégration des routes, E2E (palier, difficulté, carte jouée, run perdu), tests de règles figées d'une playlist déjà créée.

## Découpage en tickets

Epic [#368](https://github.com/Oasis35/InSeconds/issues/368), ticket parent du proto 2 [#497](https://github.com/Oasis35/InSeconds/issues/497) ; chaque sous-ticket est une ou deux PR vers `env/staging`.

1. Règles figées d'un run : difficultés par manche, seuils de départ, tirage (back).
2. Cartes : modèle, main, offres, routes, décorateurs de points (back).
3. Écran de palier et main (front).
4. Écran « Difficulté ? » et départ de la manche au toucher (front).
5. Cartes jouées sur l'écran de manche (front).
6. [#503](https://github.com/Oasis35/InSeconds/issues/503) : Fin du run : « Rejouer » en principal, partage en grille et « Bats-moi » (back et front).
7. [#504](https://github.com/Oasis35/InSeconds/issues/504) : Fantôme d'un ami, combo visuel, sons d'interface (front, une PR chacun).
8. [#505](https://github.com/Oasis35/InSeconds/issues/505) : Métriques, tableau Grafana, E2E, captures réelles et documentation à jour.
