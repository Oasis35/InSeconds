# Survie : les règles

La **seule source** des règles du mode Survie (« Runs » dans le code) : le niveau, les groupes, le classement général, l'accès, les Hits et les réglages compris. Les écrans : [`ecrans.md`](ecrans.md). La traduction technique : [`conception.md`](conception.md). Les règles du défi du jour sont dans [`../regles-du-jeu.md`](../regles-du-jeu.md). Toutes les valeurs ci-dessous sont les défauts des réglages (cf. [Réglages](#réglages)).

## Le principe

On enchaîne des **manches de 3 morceaux**, jusqu'à avoir perdu ses **3 vies** ou terminé **8 manches** (la « Série complète »). Une manche sans vie perdue rend une vie. Plus on avance, moins les morceaux sont connus, plus l'écoute raccourcit, plus un morceau rapporte. Le but est d'aller le plus loin possible, de battre ses amis sur la même playlist et de rejouer. Une partie dure de 6 à 8 minutes pour un joueur moyen.

À l'écran, un défi s'appelle une **playlist** ; le code garde `challenge`.

## La playlist

- Une playlist = une **suite de manches, 8 au plus** (`Runs:MaxRounds`), tirées **à la volée** depuis une graine jamais exposée : la manche 1 à la création, chacune des suivantes par le premier joueur qui y arrive, puis figée pour tous. Tous les joueurs d'une playlist jouent les mêmes morceaux, dans le même ordre.
- **Les morceaux sont de moins en moins connus** : le catalogue jouable (celui du défi du jour) est trié par rang Deezer et coupé en 8 tranches (`Runs:RankBands`) ; la manche k tire dans la tranche k, la dernière tranche se répète. Jamais deux fois le même morceau dans une playlist.
- **La diversité d'une partie à l'autre** (`Runs:Diversity:`) : le joueur qui tire une manche (le créateur pour la manche 1, puis le premier arrivé à chaque manche) ne retombe pas trop vite sur ce qu'il a déjà entendu. Ses morceaux entendus récemment (du plus récent au plus ancien, toutes ses parties, abandonnées comprises, un morceau retiré sans extrait exclu) passent **après** les autres (dans la tranche de notoriété de la manche d'abord : la tranche prime sur la fraîcheur, on ne sort de la tranche que si elle ne suffit pas), jusqu'à **40 % du pool jouable** (`PoolPercent`) : une quantité et non une durée, donc la mémoire s'adapte seule à la taille du catalogue et à la fréquence de jeu. C'est une préférence, jamais un blocage : si la tranche (ou le thème) ne suffit pas sans eux, le tirage reprend d'abord les plus anciennement entendus. Un ami qui rejoint ensuite joue les manches déjà tirées, sans règle propre ; ses parties comptent dans sa propre mémoire. Rien n'est stocké à part : la mémoire se lit dans les parties du joueur (les 30 dernières au plus, `MaxGames`).
- **Les règles sont figées dans la playlist** à sa création : un réglage changé ensuite ne touche pas une playlist existante, ni la partie d'un ami qui la rejoint plus tard.
- **Illimité** : un joueur qui a l'accès lance autant de parties qu'il veut ; chacune est une nouvelle playlist.

## Un morceau

1. Le son démarre **au clic** (iPhone) : « Jouer » ou « Commencer », « Jouer » sur le lien d'un ami, « Reprendre » après une pause, « Manche suivante » entre deux manches.
2. **Écoute d'un seul tenant**, de la durée du palier de la manche. Pas d'« écouter plus » ; la relecture (↺) reste libre.
3. Le joueur tape **« Artiste - Titre »** dans un seul champ (autocomplétion Deezer), puis **Valider**. Pas d'indice.
4. **« Passer (une vie) »** : 0 point et **une vie perdue**, après confirmation (« Tu perdras une vie »).
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

L'écoute suit une **échelle de paliers** : **10, 5, 3, 2, 1, 0,5 s** (le dernier palier se répète). Un morceau **trouvé en entier** rapporte les points de son palier, **100, 200, 350, 550, 800, 1 200**, sans multiplicateur. Artiste et titre sont corrigés séparément, avec la même tolérance qu'au défi du jour ([`../regles-du-jeu.md`](../regles-du-jeu.md#scoring-partiel)).

Le palier d'une manche se **calcule** depuis les réponses de la manche d'avant, jamais stocké :
- **manche terminée sans vie perdue** (les moitiés justes ne gênent pas) : le palier **raccourcit** d'un cran ;
- **manche avec au moins une vie perdue** : le palier **reste** où il est (il ne remonte pas) ;
- une manche où tous les morceaux ont été retirés (neutralisés) ne le change pas.

L'écran de bilan entre deux manches le dit : « L'écoute raccourcit » ou « L'écoute reste la même ».

## Les thèmes

À partir de la **manche 2**, quand au moins 3 thèmes ont assez de morceaux libres, le **premier joueur arrivé** à la manche choisit entre **deux thèmes** tirés au sort et le **thème mystère** (un autre thème, révélé après le choix). Son choix s'applique à la manche pour tous les joueurs de la playlist. Sans offre possible, la manche se joue sans thème. **Diversité** : l'offre écarte les thèmes déjà joués dans cette playlist et dans les parties récentes du joueur qui tire, jusqu'à **50 %** des thèmes éligibles (`Runs:Diversity:ThemePercent`, 0 coupe la règle) et en laissant toujours au moins 3 thèmes ; un thème n'est proposé que s'il a assez de morceaux pas entendus récemment, sinon (moins de 3 thèmes dans ce cas) on retombe sur tous les thèmes fournis. Les thèmes sont ceux de l'admin (onglet Contenu > Thèmes).

## La fin

- **Trois vies perdues** = fin de la partie ; **la 8e manche terminée avec au moins une vie** = **« Série complète »** ; **« Abandonner »** (à tout moment) aussi, mais un abandon ne compte ni pour le record ni pour le niveau.
- **Score final** = total des points de tous les morceaux, plus, pour une **Série complète**, **250 points par vie restante** et **500 points de complétion**. Une égalité de score n'est pas départagée. On est jugé sur le **score** et le nombre de **manches passées** (manches terminées avec au moins une vie).
- **Le score est borné** par le plafond de manches : avec les réglages par défaut, une partie parfaite rapporte 16 800 points de morceaux (8 manches de 3 morceaux, de 100 à 1 200 points), plus 1 250 de bonus (3 vies × 250 et 500), soit **18 050 points**. Seul `Runs:MaxRounds = 0` (pas de plafond) rendrait le score illimité.
- **Record** : meilleur score du joueur (et son plus grand nombre de manches passées), sur ses parties finies. L'écran de fin dit « Nouveau record » ou rappelle le record.
- **Interruption** : une partie en cours se reprend au morceau en cours (même verrou anti-triche que le défi du jour).

## Le niveau et les disques

Le niveau mesure la forme du joueur sur la durée, pas son meilleur coup (un score isolé, trouvé avec une aide extérieure, y pèse peu).

- **Après chaque partie finie** (vies épuisées ou Série complète, jamais un abandon), le niveau devient **80 % de l'ancien niveau + 20 % du score** de la partie (`Runs:Levels:OldWeightPercent`).
- Une partie ne fait **pas perdre plus de 10 %** du niveau (`MaxDropPercent`) et ne fait **monter que d'un disque au plus** (le niveau est plafonné au seuil du disque juste au-dessus).
- Pas de niveau provisoire ; le fantôme n'y est pour rien.
- **Inactivité** : sans partie finie pendant **14 jours** (`InactivityGraceDays`), le niveau baisse de **5 % par semaine** (`InactivityWeeklyDropPercent`), **jamais sous la moitié** du niveau de la dernière partie (`InactivityFloorPercent`). La baisse est **calculée à la lecture** : aucune tâche de nuit, le niveau stocké reste celui de la dernière partie. La semaine qui précède la perte d'un disque, l'accueil prévient (« Ton disque d'argent baisse dans 3 jours »).
- **7 disques**, aucun sous le premier seuil (« Pas encore de disque ») :

| Disque | Points de niveau |
|---|---|
| Rayé | 300 |
| Bronze | 900 |
| Argent | 2 000 |
| Or | 3 600 |
| Platine | 6 000 |
| Double platine | 9 600 |
| Diamant | 13 000 |

Les disques sont des points (`Runs:Levels:Discs`) : changer un seuil ne demande aucune migration. Les seuils sont provisoires, à recaler sur des parties de testeurs.

## Battre ses amis

- Chaque playlist a un lien **`inseconds.cc/survie/<code>`** (code de 6 caractères sans caractère ambigu). Il se partage depuis la fin d'une partie (« Défier un ami » : la grille d'emojis par manche et « Fais mieux » avec le lien).
- **Le lien est réservé aux comptes qui ont l'accès** (cf. [L'accès](#laccès)). **Une playlist se joue une seule fois par joueur.**
- **Défi reçu** : un compte qui ouvre le lien d'un ami sans le jouer le retrouve sur son accueil pendant **7 jours** (le pseudo de l'auteur et son total, si l'auteur a fini la playlist) ; la croix le refuse.
- **Le fantôme** : en jouant la playlist d'un ami, on voit son total au même morceau et l'écart. **Au-delà de son score figé** (il a perdu ses vies, pas vous), on continue : « Tu bats Léa ».
- **Duel** : à la fin, quand l'ami a fini la playlist, la première ligne dit « Tu bats Léa de 126 pts » (ou l'écart qui reste) ; « Revanche » relance une partie contre lui.
- **Comparaison** : après avoir fini sa propre partie (un abandon compte), on voit tous les joueurs de la playlist, manche par manche, avec leur pseudo, leur disque et leur total. Seuls ceux qui ont le lien la voient.

## Les groupes

- Un **groupe** réunit des amis autour d'un classement. Il exige un **compte** : jamais un invité.
- **15 membres** au plus par groupe (`Social:MaxMembersPerGroup`), **5 groupes** au plus par joueur (`Social:MaxGroupsPerPlayer`), un nom de **24 caractères** au plus (`Social:MaxNameLength`), contrôlé comme un pseudo.
- On le rejoint par un **lien d'invitation** (`/ranking/join/<code>`, 8 caractères), que le créateur peut renouveler. Le lien d'une playlist peut aussi faire rejoindre un groupe (« Inviter dans un groupe »).
- **Seuls les membres** voient le groupe, les pseudos des autres membres et le classement. L'aperçu d'une invitation ne montre que le nom du groupe et ses places.
- Les groupes sont ouverts à **tous les comptes**, avec ou sans l'accès Survie : leur classement par défaut est celui du Défi du jour ([`regles-du-jeu.md`](../regles-du-jeu.md#les-groupes)).
- **Le classement Survie d'un groupe** (onglet « Survie », pour un compte qui a l'accès) : par niveau Survie (le disque et les points de chacun) ; un membre qui n'a pas encore fini de partie est « pas encore joué », sans rang.
- **Le classement du Défi du jour d'un groupe**, à part (un classement par mode, jamais une moyenne) : le score du jour et les points des 7 derniers jours de chacun ([`regles-du-jeu.md`](../regles-du-jeu.md#les-groupes)).
- Le créateur qui quitte passe la main au plus ancien membre ; le dernier qui part supprime le groupe. L'admin peut renommer un groupe, remettre son nom à zéro (« Groupe 12 ») ou le supprimer.

## Le classement général

- **Par niveau**, pas par meilleur score.
- Y figurent **les comptes autorisés par l'admin** (une ligne d'accès) **qui ont fini une partie** ; **jamais un invité, jamais un admin**, même s'il a l'accès.
- On y voit **les 20 premiers**, puis sa propre place et ses deux voisins : le rang, le nom, le disque et les points, jamais le nombre de parties ni le record. Tout joueur identifié peut le lire.
- Chacun y apparaît sous son **pseudo** (le défaut) ou sous un **alias musical** de son choix (« Hibou rêveur 12 » : un animal ou un objet musical, un adjectif, deux chiffres). L'alias est **unique** : ni l'alias d'un autre, ni le pseudo d'un compte ; un compte ne peut pas prendre pour pseudo l'alias d'un autre. Revenir à son pseudo libère l'alias. Dans les groupes, ce sont toujours les vrais pseudos.
- La ligne « Tu apparais sous Léa · Modifier » ouvre le choix ; l'étape du pseudo à la création du compte prévient qu'il apparaîtra au classement.
- Le classement est **gardé une minute** : un changement de pseudo s'y voit au plus une minute plus tard ; un changement de nom au classement et un effacement de compte le vident tout de suite.

## L'accès

- **Sur invitation** : réservé aux comptes autorisés par l'admin (interrupteur de l'onglet Joueurs). Un admin n'a pas l'accès d'office : il a son interrupteur comme les autres, et peut se le couper pour voir le jeu sans Survie. Un invité n'a jamais l'accès.
- La barre du bas, l'historique du défi, les groupes et leur classement du Défi du jour sont **pour tous** ; l'accès ajoute ce qui touche la Survie : la carte Survie de l'accueil, l'onglet « Survie » de l'historique et du classement d'un groupe, la pastille « Général », le niveau, les Hits et le défi d'ami. Sans accès, `/survie` renvoie vers le défi du jour.
- **Le lien d'un ami ne remplace pas l'accès** : sans accès (invité, compte non autorisé, visiteur sans identité), le lien ouvre l'écran « Survie n'est pas encore ouverte » avec un seul bouton, « Jouer le défi du jour », jamais une création de compte ; le serveur refuse le départ (403 `runs.access_denied`).
- Retirer l'accès n'interrompt pas une partie en cours ; cela empêche seulement d'en lancer une nouvelle.

## Les Hits

**17 jalons**, calculés à la lecture sur les parties finies du joueur, rien de stocké côté serveur (16 par le serveur, le premier groupe par le navigateur). Un Hit obtenu le reste (les Hits de niveau jugent le plus haut niveau atteint).

- **Débuts** : première Survie terminée, premier record battu, premier groupe rejoint.
- **Volume** : 10 Survies jouées, 50 Survies jouées, **Marathon** (8 manches jouées en entier dans une même partie).
- **Jeu** : manche parfaite (tous les morceaux d'une manche trouvés), **Oreille d'or** (un morceau trouvé en entier à l'écoute de 0,5 s), **Sans une égratignure** (3 manches de suite sans perdre une vie), **Mystère résolu** (une manche au thème mystère, choisi par le joueur, dont tous les morceaux sont trouvés en entier), 10 bonnes réponses d'affilée.
- **Amis** : un ami a joué ta Survie, duel gagné, **Fantôme battu en retard** (dépasser l'ami après son arrêt : aller plus loin que lui et faire plus de points que son total), 5 duels gagnés.
- **Niveau** : niveau Or, niveau Diamant.

Un Hit obtenu depuis la dernière visite arrive avec un temps fort (le navigateur retient ceux qu'il a déjà montrés).

## Réglages

Lus dans `infra.settings` et **relus à chaud**. Les réglages `Runs:` sont contrôlés au démarrage de l'API (qui refuse de démarrer s'ils sont incohérents) **et** à l'usage (une valeur incohérente écrite à chaud fait retomber tous les réglages `Runs:` sur leurs défauts, avec une erreur au journal). Les réglages `Social:` hors bornes retombent un par un sur leur défaut, sans empêcher le jeu.

**Figés** : copiés dans la playlist à sa création, ils ne changent que les playlists à venir. **À chaud** : lus à chaque usage, ils s'appliquent tout de suite à tout le monde.

| Clé | Défaut | Bornes | Effet |
|---|---|---|---|
| `Runs:Lives` | `3` | 1 à 10 | figé : vies de départ |
| `Runs:TracksPerRound` | `3` | 1 à 20 | figé : morceaux d'une manche |
| `Runs:RegainLife` | `true` | | figé : une manche sans vie perdue rend une vie |
| `Runs:ShortenOnNoLifeLost` | `true` | | figé : l'écoute raccourcit après une manche sans vie perdue (une moitié juste ne gêne pas) |
| `Runs:HoldOnLifeLost` | `true` | | figé : une manche avec une vie perdue laisse l'écoute en place (`false` : elle rallonge d'un cran) |
| `Runs:MaxRounds` | `8` | 0 à 50 | figé : plafond de manches, la « Série complète » ; 0 : sans plafond (score illimité) |
| `Runs:LifeBonus` / `CompleteBonus` | `250` / `500` | 0 à 100 000 | figé : points par vie restante et points de la Série complète |
| `Runs:ListenLadder` | `[10,5,3,2,1,0.5]` | 2 à 10 durées, positives, sous 100 s, deux décimales au plus, strictement décroissantes | figé : les paliers d'écoute, le dernier se répète |
| `Runs:StepPoints` | `[100,200,350,550,800,1200]` | une valeur positive par palier | figé : points d'un morceau trouvé en entier à chaque palier |
| `Runs:AnswerSeconds` | `45` | 0, ou plus long que le premier palier et 600 au plus | figé : chrono d'un morceau ; 0 : pas de chrono |
| `Runs:RankBands` | `8` | 1 à 20 | figé : tranches de notoriété du catalogue |
| `Runs:Diversity:PoolPercent` | `40` | 0 à 90 | à chaud : part du pool jouable évitée parce que déjà entendue ; 0 coupe la règle |
| `Runs:Diversity:ThemePercent` | `50` | 0 à 100 | à chaud : part des thèmes éligibles écartables (il en reste toujours 3) ; 0 coupe la règle |
| `Runs:Diversity:MaxGames` | `30` | 1 à 200 | à chaud : parties récentes lues pour la mémoire du tirage |
| `Runs:Levels:OldWeightPercent` | `80` | 50 à 95 | à chaud : part de l'ancien niveau dans le nouveau |
| `Runs:Levels:MaxDropPercent` | `10` | 0 à 50 | à chaud : baisse maximale du niveau sur une partie |
| `Runs:Levels:InactivityGraceDays` | `14` | 1 à 365 | à chaud : jours sans partie finie avant la baisse |
| `Runs:Levels:InactivityWeeklyDropPercent` | `5` | 0 à 50 | à chaud : baisse par semaine d'inactivité |
| `Runs:Levels:InactivityFloorPercent` | `50` | 0 à 100 | à chaud : plancher de l'inactivité |
| `Runs:Levels:Discs` | les 7 disques ci-dessus | 1 à 12 disques distincts, le premier au-dessus de 0, seuils strictement croissants | à chaud : liste d'objets `{"disc":"runs.discs.gold","points":3600}` |
| `Social:MaxMembersPerGroup` | `15` | 2 à 100 | à chaud : membres d'un groupe, créateur compris |
| `Social:MaxGroupsPerPlayer` | `5` | 1 à 50 | à chaud : groupes d'un joueur |
| `Social:MaxNameLength` | `24` | 3 à 40 | à chaud : caractères du nom d'un groupe |

Une liste (`ListenLadder`, `StepPoints`, `Discs`) vide ne s'écrit pas dans les réglages : sans valeur, le défaut s'applique. Mécanisme de chargement : [`CLAUDE.md`](../../CLAUDE.md) § Réglages et [`.claude/rules/back/reglages.md`](../../.claude/rules/back/reglages.md).

**Les playlists anciennes** gardent les règles figées à leur création : manches de 5 morceaux, pas de vie regagnée, une écoute qui ne raccourcit qu'après une manche où tout est trouvé en entier et qui rallonge après une vie perdue, ni plafond ni bonus. Leur bilan de manche peut encore dire « L'écoute rallonge ».
