# Platines proto 3 : plus simple, plus ludique, plus viral

Le proto 3 ([#531](https://github.com/Oasis35/InSeconds/issues/531)) simplifie le mode pour qu'un joueur occasionnel le comprenne sans explication, tout en gardant de la profondeur pour un fan de blind tests. Il se livre en **3 PR** vers `env/staging`, chacune testée au staging avant la suivante. Les chiffres des difficultés et des cartes sont des hypothèses, à régler aux parties de test.

## Ce qui est décidé

- **Un seul choix par palier : la difficulté.** Les quatre manches restent.
- **Difficultés Facile, Normal, Mélomane** (anciennement Facile, Sûre, Risquée : seuls les libellés changent, le code garde `easy`, `safe`, `risky`). Chaque colonne montre l'objectif en points et **ce qu'un morceau rapporte au plus** ; plus de plafond de manche, de « max » ni de total atteignable à l'écran. Mélomane rapporte plus de points au total (le facteur de points reste dans les règles figées, il ne s'affiche plus en multiplicateur). **Normal est présélectionné** ; toucher une difficulté lance la manche, sans bouton « Jouer ».
- **Le palier et la difficulté tiennent sur un seul écran** (la manche suivante en trois lignes ; un toucher lance la manche), sans ascenseur sur un téléphone.
- **Retour « objectif atteint »** pendant la manche : un ✓ et un petit temps fort quand l'objectif est franchi.
- **Le Joker disparaît**, remplacé par l'Échange offert (« Changer de morceau », un par manche, non cumulable) : PR 2, livrée.
- **Cartes réduites à 3** (QCM, Prolongation, Indice), **gagnées** quand une manche dépasse l'objectif de 25 % (au lieu d'une offre 1 parmi 3) : PR 2, livrée. Les anciennes playlists (Joker, offres, cartes durables) sont à purger à la fin du proto, après validation au staging : le code ne tolère plus leurs règles.
- **Fin de run** : duel avec l'ami en tête, fantôme dès le premier morceau, Revanche : PR 3, livrée.
- Plus tard, à part : ouverture de la création de playlists et aperçu de lien ([#535](https://github.com/Oasis35/InSeconds/issues/535)), genre saisi par l'admin puis thèmes ([#536](https://github.com/Oasis35/InSeconds/issues/536)), idées virales ([#537](https://github.com/Oasis35/InSeconds/issues/537)).

## PR 1 ([#532](https://github.com/Oasis35/InSeconds/issues/532)) : ce qui change à l'écran

- Libellés `runs.difficulty.*` (FR et EN), partout où ils s'affichent : colonnes, ligne de partage (« Manche 1 · Normal »).
- Composant `run-difficulty-columns` : les trois colonnes, partagées par l'écran de palier (playlist à coups de pouce : tout est sur le palier) et par l'écran « Difficulté ? » (playlist sans coups de pouce, qui garde son écran) ; un toucher sur une ligne lance la manche.
- `RunGameStore.chooseDifficulty` accepte l'écran de palier ; l'offre de cartes encore ouverte est fermée par le serveur au choix (`RunSession.ChooseDifficulty`), rien ne change côté API.
- En-tête de manche : « ✓ objectif atteint » et son petit temps fort au franchissement.
- Les cartes (offre de 3, main de 2) restent telles quelles jusqu'à la PR 2.

Ce que vaut au plus un morceau (`perTrack`) se calcule dans le front : le plafond de la manche (`maxScore`) divisé par les morceaux de la manche (`tracksPerRound`).

## PR 2 ([#533](https://github.com/Oasis35/InSeconds/issues/533) et [#534](https://github.com/Oasis35/InSeconds/issues/534)) : l'Échange et les cartes gagnées

- **Échange** : lien « Changer de morceau » à côté de « Passer » (même style, souligné, neutre). Un par manche, non cumulable, tant que le morceau en cours n'a pas été écouté ni répondu et que la manche n'attend plus sa difficulté ; le morceau de réserve prend la même place, écoute et chrono remis à zéro. Route `POST /api/runs/sessions/{id}/swap` (`swapRunTrack`), 409 `runs.swap_unavailable`.
- **Cartes gagnées** : QCM, Indice (en puces étiquetées : année, initiales de l'artiste, initiales du titre, genre) et Prolongation. Une manche passée à objectif + 25 % (`Runs:RewardMarginPercent`) donne la carte tirée à l'avance pour cette manche (graine de la playlist) ; une seule carte à la fois, à usage unique, qui agit toute seule sur la manche suivante. L'écran de palier l'annonce (« Carte gagnée »), un second son la souligne. Plus de route pour les cartes (prendre, passer, lâcher, jouer), plus de main de 2, plus d'offre.
- **Réglages** : `Runs:Cards` (`three_choices`, `hint`, `extend`), `Runs:RewardMarginPercent`, `Runs:ExtendBonusSeconds` ; supprimés : `HandSize`, `DurableCards`, `HourglassSeconds`, `LowerTargetPercent`. Migration `RunCardsEarned` : retire `offers_closed_through` de `runs.sessions` et `decoy_track_ids` de `runs.session_cards` (les leurres du QCM sont retirés à chaque envoi, plus figés).
- **Mesure** : `inseconds.runs.cards` avec les actions `earned` et `swapped`.

## PR 3 ([#535](https://github.com/Oasis35/InSeconds/issues/535), première partie) : la fin de run

- **Duel en tête** : quand un autre joueur joue la playlist d'un ami qui l'a finie, l'écran de fin s'ouvre sur « Tu bats Léa de 126 pts » (avance), « Léa gagne de 40 pts » (retard) ou « Égalité avec Léa », sur un ton neutre. Le total de l'ami se compare sur les seuls morceaux que le joueur a joués. Le fantôme du serveur (`session.ghost`) reste donc après la fin de la partie (il disparaissait) ; le front en tire le duel (`duelOf`). Rien pour sa propre playlist, ni pour une partie abandonnée. Compteur `inseconds.runs.duels` (`result` : `ahead`, `behind`, `tied`) et panneau Grafana « Duels contre l'ami qui a lancé la playlist ».
- **Fantôme dès le premier morceau** : il apparaît déjà à la première réponse (l'écart se lit sous « Total du run » dès le premier morceau joué) ; rien à changer, un test d'intégration et l'E2E du lien d'un ami le vérifient.
- **Revanche** : en duel, « Rejouer » s'appelle « Revanche ». Une playlist ne se rejoue pas, c'est donc une nouvelle playlist pour le joueur (même bouton, même comportement ; sans accès, le jeu du jour reste proposé).
- **Fin plus courte** : séquence de 2,2 s au plus (`finishSequence`, façade `ui/motion`) : le disque se pose, le score compte, le badge « Nouveau record » se pose, les carrés se remplissent un à un, puis les cases des manches et le bloc de partage ; un toucher la saute, les boutons restent actifs dès le début, rien en mouvement réduit.
- **Sons** : un nouveau record sonne à la fin à la place de la victoire ou de la défaite (`record`, arpège de quatre notes, plus brillant).
- **Partage en défi** : le texte partagé à la fin d'un run gagné en duel raconte la victoire juste sous le score (« J'ai battu Léa de 126 pts. », jamais une défaite ni une égalité) et invite à faire mieux sur la même playlist (« Fais mieux sur la même playlist : » puis le lien `utm_source=share`). La mesure de la viralité est celle d'avant : les invités arrivés par ce lien comptent dans `inseconds.players.guests_created` (`source` = `share`).
- Reste du ticket #535, en PR à part : la création de playlists ouverte à tous les comptes puis aux invités, l'aperçu de lien par playlist, la mention « X a joué ta playlist ».

## Le pseudo d'un invité

Pour que la comparaison d'une playlist montre des noms et non des « Invité », un invité donne un **pseudo** à la fin de sa première partie sur la playlist d'un ami, avant la comparaison.

- **Obligatoire, sans générateur ni « Passer »** ; rattaché au joueur invité (donc à son navigateur par le cookie), retrouvé à chaque visite, modifiable par un crayon à côté de sa ligne (un compte passe par son profil et garde son pseudo de compte).
- **Jamais celui d'un compte** (sans tenir compte de la casse) ; **aucune unicité entre invités**. Deux joueurs d'une même comparaison au même pseudo se distinguent par une petite marque grise (au moins deux caractères hexadécimaux, affichés « #a3 », dérivés de l'identifiant du joueur et jamais du cookie).
- **Limite assumée** : la priorité des comptes vaut à l'écriture du pseudo d'invité ; un compte créé ensuite au même pseudo ne le déloge pas (la marque distingue les deux dans la comparaison, pas pour l'auteur ni le fantôme). Le pseudo d'un invité est vidé 91 jours après sa dernière visite.
- **RGPD** : donnée personnelle rattachée à l'identifiant pseudonyme, visible des autres joueurs de la playlist, dans l'export et l'effacement du joueur, dite dans `/privacy` et `docs/conformite/rgpd.md`.

## Les thèmes ([#536](https://github.com/Oasis35/InSeconds/issues/536))

Un **thème** est une notion à part, ni un genre (celui de l'album chez Deezer, ou saisi par l'admin) ni une époque : une étiquette que l'admin range comme il l'entend (« Années 80 », « Films », « Rap français »…).

- **L'admin tient la liste** (onglet Thèmes) : ajouter, renommer (nom unique, sans la casse), supprimer **seulement un thème qu'aucun morceau n'a** (409 `catalogue.theme_in_use`). Il remplit un thème depuis l'onglet (morceaux du pool cochés, ou morceaux de Deezer ajoutés au pool et au thème d'un geste, ✕ pour en retirer un, le morceau restant dans le pool) ou en **cochant les thèmes dans la fenêtre de modification du morceau** (jamais de saisie libre). L'onglet signale en rouge un thème qui a moins de 7 morceaux jouables (extrait disponible, pas désactivé) : il n'est alors jamais proposé en jeu ; jaune de 7 à 13, vert à partir de 14. Un morceau peut avoir plusieurs thèmes (table de jonction `catalogue.track_themes`). La colonne part vide : c'est l'admin qui trie.
- **Quelle manche** : `Runs:ThemedRounds` (défaut `[3]`, jamais la première manche : le joueur ne connaît pas encore la playlist). Une manche à thème prend ses 5 morceaux (plus la réserve de l'Échange) parmi ceux du thème ; un thème qui n'en a pas assez pour la manche et sa réserve n'est jamais proposé ni tiré. La difficulté monte toujours : les manches sans thème se partagent les tranches de rang restantes.
- **Qui choisit** : le créateur de la playlist, au lancement, parmi **deux thèmes tirés au hasard** plus « Surprise » (le serveur tire) ; `GET /api/runs/theme-offer` donne les deux thèmes, `POST /api/runs/challenges?themeId=` lance avec le choix. Un thème invalide ou qui n'a plus assez de morceaux est ignoré (tirage). Ses amis jouent la même playlist, sans choix, avec les mêmes morceaux. Sans thème assez fourni, rien n'est proposé et la playlist se lance tout de suite.
- **Figé avec la playlist** : `RunRules.Themes` (manche, identifiant et **nom du thème tel qu'à la création** : un renommage ne change pas une playlist déjà tirée).
- **À l'écran** : l'écran de choix (tuiles et « Surprise », « Lancer » est le clic qui lance le son), l'annonce du thème de la manche sur l'écran de palier, une pastille du thème à côté de « Manche 3 » pendant la manche, et une ligne « Manche 3 : thème Années 80 » sur le lien d'un ami.
