# Survie (mode Run) : les règles de la Série

Règles validées par Clément en novembre 2026 (refonte « la Série », qui remplace le modèle à jauge, difficultés et cartes ; l'ancien modèle est archivé dans [`../historique/runs-ancien-modele/`](../historique/runs-ancien-modele/)). Les écrans : [`ecrans.md`](ecrans.md). Leur traduction technique : [`conception.md`](conception.md). Toutes les valeurs ci-dessous sont les défauts de `Runs:` (relus à chaud, cf. [Réglages](#réglages)).

## Le principe

On enchaîne des **manches de 3 morceaux**, jusqu'à avoir perdu ses **3 vies** ou joué **8 manches** (la « Série complète »). Une manche sans vie perdue rend une vie. Plus on avance, moins les morceaux sont connus, plus l'écoute raccourcit, plus un morceau rapporte. Le but est d'aller le plus loin possible, de battre ses amis sur la même playlist et de rejouer. Une partie dure de 6 à 8 minutes pour un joueur moyen.

À l'écran, un défi s'appelle une **playlist** ; le code garde `challenge`.

## La playlist

- Une playlist = une **suite de manches, 8 au plus** (le plafond), tirées **à la volée** depuis une graine jamais exposée : la manche 1 à la création, chacune des suivantes par le premier joueur qui y arrive, puis figée pour tous. Tous les joueurs d'une playlist jouent les mêmes morceaux, dans le même ordre.
- **Les morceaux sont de moins en moins connus** : le catalogue jouable (Daily compris) est trié par rang Deezer et coupé en 8 tranches (`Runs:RankBands`) ; la manche k tire dans la tranche k, la dernière tranche se répète. Jamais deux fois le même morceau dans une playlist.
- **La diversité d'une partie à l'autre** (`Runs:Diversity:`) : le joueur qui tire une manche (le créateur pour la manche 1, puis le premier arrivé à chaque manche) ne retombe pas trop vite sur ce qu'il a déjà entendu. Ses morceaux entendus récemment (du plus récent au plus ancien, toutes ses parties, abandonnées comprises, un morceau retiré sans extrait exclu) passent **après** les autres (dans la tranche de notoriété de la manche d'abord : la tranche prime sur la fraîcheur, on ne sort de la tranche que si elle ne suffit pas), jusqu'à **40 % du pool jouable** (`PoolPercent`) : une quantité et non une durée, donc la mémoire s'adapte seule à la taille du catalogue et à la fréquence de jeu. C'est une préférence, jamais un blocage : si la tranche (ou le thème) ne suffit pas sans eux, le tirage reprend d'abord les plus anciennement entendus. Un ami qui rejoint ensuite joue les manches déjà tirées, sans règle propre ; ses parties comptent dans sa propre mémoire. Rien n'est stocké à part : la mémoire se lit dans les parties du joueur (les 30 dernières au plus, `MaxGames`).
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
- Une manche **terminée sans vie perdue** (une moitié juste ne compte pas comme une vie perdue) **rend une vie**, jamais au-delà des 3 du départ. Une manche où l'on a perdu une vie ne rend rien.
- Un morceau **raté** (ni artiste ni titre), **passé** ou **répondu après le chrono** coûte **une vie**.
- Une **moitié juste** (l'artiste ou le titre seulement) vaut **la moitié des points** et **ne coûte pas de vie**.
- La **dernière vie perdue arrête la partie net**, au milieu d'une manche s'il le faut.
- Un morceau **sans extrait** (Deezer l'a retiré depuis le tirage) est **neutralisé par le serveur** : 0 point, ni vie, ni palier touchés. Une panne passagère de Deezer ne neutralise pas : le joueur réessaie.

## L'écoute et les points

L'écoute suit une **échelle de paliers** : **10, 5, 3, 2, 1, 0,5 s** (le dernier palier se répète). Un morceau **trouvé en entier** rapporte les points de son palier, **100, 200, 350, 550, 800, 1 200**, sans multiplicateur. Artiste et titre sont corrigés séparément, avec la même tolérance qu'au Daily.

Le palier d'une manche se **calcule** depuis les réponses de la manche d'avant, jamais stocké :
- **manche terminée sans vie perdue** (les moitiés justes ne gênent plus) : le palier **raccourcit** d'un cran ;
- **manche avec au moins une vie perdue** : le palier **reste** où il est (on ne remonte pas) ;
- une manche où tous les morceaux ont été retirés (neutralisés) ne bouge pas.

L'écran de bilan entre deux manches le dit : « L'écoute raccourcit », « L'écoute reste la même » (« L'écoute rallonge » ne se voit plus que sur les playlists d'avant).

## Les thèmes

À partir de la **manche 2**, quand au moins 3 thèmes ont assez de morceaux libres, le **premier joueur arrivé** à la manche choisit entre **deux thèmes** tirés au sort et le **thème mystère** (un autre thème, révélé après le choix). Son choix s'applique à la manche pour tous les joueurs de la playlist. Sans offre possible, la manche se joue sans thème. **Diversité** : l'offre écarte les thèmes déjà joués dans cette playlist et dans les parties récentes du joueur qui tire, jusqu'à **50 %** des thèmes éligibles (`Runs:Diversity:ThemePercent`, 0 coupe la règle) et en laissant toujours au moins 3 thèmes ; un thème n'est proposé que s'il a assez de morceaux pas entendus récemment, sinon (moins de 3 thèmes dans ce cas) on retombe sur tous les thèmes fournis. Les thèmes sont ceux de l'admin (onglet Contenu > Thèmes).

## La fin

- **Trois vies perdues** = fin de la partie ; **la 8e manche terminée avec au moins une vie** = **« Série complète »** ; **« Abandonner »** (à tout moment) aussi, mais un abandon ne compte pas pour le record.
- **Score final** = total des points de tous les morceaux, plus, pour une **Série complète**, **250 points par vie restante** et **500 points de complétion**. Une égalité de score n'est pas départagée. On est jugé sur le **score** et le nombre de **manches passées** (manches terminées avec au moins une vie).
- **Record** : meilleur score par joueur (invité compris). L'écran de fin dit « Nouveau record » ou rappelle le record.
- **Niveau** : les parties alimentent le niveau du joueur (disques, de Rayé à Diamant), cf. [`proto4.md`](proto4.md).
- **Interruption** : une partie en cours se reprend au morceau en cours (même verrou anti-triche que le Daily).

## Battre ses amis

- Chaque playlist a un lien **`inseconds.cc/setlist/K7Q2M9`** (code de 6 caractères sans caractère ambigu). Il se partage depuis la fin d'une partie (« Défier un ami » : la grille d'emojis par manche et « Fais mieux » avec le lien).
- **Une playlist se joue une seule fois par joueur**, sans compte obligatoire (un invité est créé comme au Daily).
- **Le fantôme** : en jouant la playlist d'un ami, on voit son total au même morceau et l'écart. **Au-delà de son score figé** (il a perdu ses vies, pas vous), on continue : « Tu bats Léa ».
- **Duel** : à la fin, quand l'ami a fini la playlist, la première ligne dit « Tu bats Léa de 126 pts » (ou l'écart qui reste) ; « Revanche » relance une partie contre lui.
- **Comparaison** : après avoir fini sa propre partie (un abandon compte), on voit tous les joueurs de la playlist, manche par manche, avec leur pseudo (« Invité » pour un invité) et leur total. Ce n'est **pas un classement général** : seuls ceux qui ont le lien la voient.
- **Hits** : 17 jalons calculés à la lecture sur les parties finies, rien de stocké :
  - débuts : première setlist, record battu, premier groupe (le seul côté groupes) ;
  - volume : 10 setlists, 50 setlists, **Marathon** (8 manches jouées en entier dans une même partie) ;
  - jeu : manche parfaite, **Oreille d'or** (un morceau trouvé en entier à l'écoute de 0,5 s), **Sans une égratignure** (3 manches de suite sans perdre une vie), **Mystère résolu** (une manche au thème mystère, choisi par le joueur, dont tous les morceaux sont trouvés en entier), 10 bonnes réponses d'affilée ;
  - social : un ami a joué ta setlist, duel gagné, **Fantôme battu en retard** (dépasser l'ami après son arrêt : aller plus loin que lui et faire plus de points que son total), 5 duels ;
  - niveau : niveau Or, niveau Diamant.

## L'accès

- **Sur invitation** : réservé aux comptes autorisés par l'admin (onglet Joueurs), admins d'office. Un invité sans compte n'a pas l'accès. L'interrupteur est distinct du rôle admin.
- Sans accès, rien ne change pour le joueur : pas de carte Survie, et `/survie` renvoie vers le Daily.
- **Lien reçu** : le mode est réservé aux comptes qui y ont accès, liens d'ami compris. Sans accès (invité, compte non autorisé, visiteur sans identité), le lien ouvre un écran « Survie n'est pas encore ouverte » avec un seul bouton vers le défi du jour, et le serveur refuse le départ (403 `runs.access_denied`). Avec l'accès, le joueur peut jouer la playlist ; à la fin, « Rejouer » reste le geste principal, sauf quand le défi du jour attend encore : sa carte passe alors devant.
- Retirer l'accès n'interrompt pas une partie en cours ; cela empêche seulement d'en lancer une nouvelle.

## Réglages

Tous relus à chaud (`Runs:…`, `infra.settings`), contrôlés au démarrage de l'API **et** à l'usage (une valeur incohérente retombe sur les défauts) : `Lives` (3), `TracksPerRound` (3), `RegainLife` (vrai), `ShortenOnNoLifeLost` (vrai), `HoldOnLifeLost` (vrai), `MaxRounds` (8 ; 0 : pas de plafond), `LifeBonus` (250), `CompleteBonus` (500), `ListenLadder` (10, 5, 3, 2, 1, 0,5), `StepPoints` (100 à 1 200), `AnswerSeconds` (45), `RankBands` (8), `Levels` (le niveau). Tableau complet : [`CLAUDE.md`](../../CLAUDE.md) § Réglages.

**Les playlists d'avant** (créées avant les règles d'équilibrage de novembre 2026) gardent les règles figées à leur création (une playlist créée entre l'arrivée de la descente de l'écoute et celle de la règle « une vie perdue laisse le palier » rallonge encore après une vie perdue) : manches de 5, pas de vie regagnée, l'écoute ne raccourcit qu'après une manche où tout est trouvé en entier et rallonge après une vie perdue, pas de plafond ni de bonus.
