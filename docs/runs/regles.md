# Setlist (mode Run) : les règles de la Série

Règles validées par Clément en novembre 2026 (refonte « la Série », qui remplace le modèle à jauge, difficultés et cartes ; l'ancien modèle est archivé dans [`../historique/runs-ancien-modele/`](../historique/runs-ancien-modele/)). Les écrans : [`ecrans.md`](ecrans.md). Leur traduction technique : [`conception.md`](conception.md). Toutes les valeurs ci-dessous sont les défauts de `Runs:` (relus à chaud, cf. [Réglages](#réglages)).

## Le principe

Pas de fin fixée : on enchaîne des **manches de 5 morceaux** jusqu'à avoir perdu ses **3 vies**. Plus on avance, moins les morceaux sont connus, plus l'écoute raccourcit, plus un morceau rapporte. Le but est d'aller le plus loin possible, de battre ses amis sur la même playlist et de rejouer.

À l'écran, un défi s'appelle une **playlist** ; le code garde `challenge`.

## La playlist

- Une playlist = une **suite sans fin de manches**, tirées **à la volée** depuis une graine jamais exposée : la manche 1 à la création, chacune des suivantes par le premier joueur qui y arrive, puis figée pour tous. Tous les joueurs d'une playlist jouent les mêmes morceaux, dans le même ordre.
- **Les morceaux sont de moins en moins connus** : le catalogue jouable (Daily compris) est trié par rang Deezer et coupé en 8 tranches (`Runs:RankBands`) ; la manche k tire dans la tranche k, la dernière tranche se répète. Jamais deux fois le même morceau dans une playlist.
- **Les règles sont figées dans la playlist** à sa création : un réglage changé ensuite ne touche pas une playlist existante, ni la partie d'un ami qui la rejoint plus tard.
- **Illimité** : un joueur autorisé lance autant de parties qu'il veut ; chacune est une nouvelle playlist.

## Un morceau

1. Le son démarre **au clic** (iPhone) : « Lancer une partie », « Jouer » sur le lien d'un ami, « Reprendre » après une pause, « Manche suivante » entre deux manches.
2. **Écoute d'un seul tenant**, de la durée du palier de la manche. Pas d'« écouter plus » ; la relecture (↺) reste libre.
3. Le joueur tape **« Artiste - Titre »** dans un seul champ (autocomplétion Deezer), puis **Valider**. Pas d'indice.
4. **Passer** : 0 point, une vie perdue, après confirmation.
5. **Chrono de 45 s par morceau** (`Runs:AnswerSeconds`) : il part au premier son et compte l'écoute, les réécoutes et la saisie. À zéro, le navigateur envoie ce qui est tapé ; une réponse arrivée après le chrono (5 s de marge réseau) est un morceau passé. Le chrono continue pendant une absence. Le serveur fait foi.
6. **La réponse s'affiche aussitôt** : pochette, artiste et titre, ce qui était juste, les points du morceau. Le joueur enchaîne quand il veut, ou après 2 s.

## Les vies

- **3 vies** au départ.
- Un morceau **raté** (ni artiste ni titre), **passé** ou **répondu après le chrono** coûte **une vie**.
- Une **moitié juste** (l'artiste ou le titre seulement) vaut **la moitié des points** et **ne coûte pas de vie**.
- La **dernière vie perdue arrête la partie net**, au milieu d'une manche s'il le faut.
- Un morceau **sans extrait** (Deezer l'a retiré depuis le tirage) est **neutralisé par le serveur** : 0 point, ni vie, ni palier touchés. Une panne passagère de Deezer ne neutralise pas : le joueur réessaie.

## L'écoute et les points

L'écoute suit une **échelle de paliers** : **10, 5, 3, 2, 1, 0,5 s** (le dernier palier se répète). Un morceau **trouvé en entier** rapporte les points de son palier, **100, 200, 350, 550, 800, 1 200**, sans multiplicateur. Artiste et titre sont corrigés séparément, avec la même tolérance qu'au Daily.

Le palier d'une manche se **calcule** depuis les réponses de la manche d'avant, jamais stocké :
- **manche sans erreur** (que des morceaux trouvés en entier) : le palier **raccourcit** d'un cran ;
- **manche avec au moins une erreur** : le palier **rallonge** d'un cran, jamais au-dessus de 10 s (une erreur au premier palier le laisse là) ;
- **manche sans erreur mais avec au moins une moitié juste** : le palier **ne bouge pas**.

L'écran de bilan entre deux manches le dit : « L'écoute raccourcit », « L'écoute reste la même », « L'écoute rallonge ».

## Les thèmes

À partir de la **manche 2**, quand au moins 3 thèmes ont assez de morceaux libres, le **premier joueur arrivé** à la manche choisit entre **deux thèmes** tirés au sort et le **thème mystère** (un autre thème, révélé après le choix). Son choix s'applique à la manche pour tous les joueurs de la playlist. Sans offre possible, la manche se joue sans thème. Les thèmes sont ceux de l'admin (onglet Contenu > Thèmes).

## La fin

- **Trois vies perdues** = fin de la partie ; **« Abandonner »** (à tout moment) aussi, mais un abandon ne compte pas pour le record.
- **Score final** = total des points de tous les morceaux. Plus de victoire ni de défaite fixes : on est jugé sur le **score** et le nombre de **manches passées** (manches terminées avec au moins une vie).
- **Record** : meilleur score par joueur (invité compris). L'écran de fin dit « Nouveau record » ou rappelle le record.
- **Niveau** : les parties alimentent le niveau du joueur (disques, de Rayé à Diamant), cf. [`proto4.md`](proto4.md).
- **Interruption** : une partie en cours se reprend au morceau en cours (même verrou anti-triche que le Daily).

## Battre ses amis

- Chaque playlist a un lien **`inseconds.cc/setlist/K7Q2M9`** (code de 6 caractères sans caractère ambigu). Il se partage depuis la fin d'une partie (« Défier un ami » : la grille d'emojis par manche et « Fais mieux » avec le lien).
- **Une playlist se joue une seule fois par joueur**, sans compte obligatoire (un invité est créé comme au Daily).
- **Le fantôme** : en jouant la playlist d'un ami, on voit son total au même morceau et l'écart. **Au-delà de son score figé** (il a perdu ses vies, pas vous), on continue : « Tu bats Léa ».
- **Duel** : à la fin, quand l'ami a fini la playlist, la première ligne dit « Tu bats Léa de 126 pts » (ou l'écart qui reste) ; « Revanche » relance une partie contre lui.
- **Comparaison** : après avoir fini sa propre partie (un abandon compte), on voit tous les joueurs de la playlist, manche par manche, avec leur pseudo (« Invité » pour un invité) et leur total. Ce n'est **pas un classement général** : seuls ceux qui ont le lien la voient.
- **Hits** : 11 jalons calculés à la lecture sur les parties finies (première setlist, record battu, 10 et 50 setlists, manche parfaite, 10 bonnes réponses d'affilée, un ami a joué ta setlist, duel gagné, 5 duels, niveau Or, niveau Diamant), plus un 12e côté groupes (premier groupe).

## L'accès

- **Sur invitation** : réservé aux comptes autorisés par l'admin (onglet Joueurs), admins d'office. Un invité sans compte n'a pas l'accès. L'interrupteur est distinct du rôle admin.
- Sans accès, rien ne change pour le joueur : pas de carte Setlist, et `/setlist` renvoie vers le Daily.
- **Lien reçu** : un ami sans accès qui ouvre le lien d'une playlist peut jouer **cette playlist-là seulement**, invité compris ; à la fin, une invitation à jouer au Daily remplace « Rejouer ».
- Retirer l'accès n'interrompt pas une partie en cours ; cela empêche seulement d'en lancer une nouvelle.

## Réglages

Tous relus à chaud (`Runs:…`, `infra.settings`), contrôlés au démarrage de l'API **et** à l'usage (une valeur incohérente retombe sur les défauts) : `Lives` (3), `TracksPerRound` (5), `ListenLadder` (10, 5, 3, 2, 1, 0,5), `StepPoints` (100 à 1 200), `AnswerSeconds` (45), `RankBands` (8), `Levels` (le niveau). Tableau complet : [`CLAUDE.md`](../../CLAUDE.md) § Réglages.
