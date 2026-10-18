# Run (Platines) : les écrans du proto 1

**Ces maquettes font référence** (Clément, 17/10/2026) : elles sont à intégrer telles quelles, avec le design système existant (tokens `:root` de `styles.scss`, `appButton`, composants du domaine `gameplay`, `ModalService`). Les images de `maquettes/` sont la copie figée de l'artifact Design « Platines » (lien dans #360). Les règles qu'elles montrent : [`regles.md`](regles.md).

Format : téléphone, 390 × 844. Les textes des maquettes sont ceux à reprendre dans les traductions FR (`runs.*`), à traduire en EN. Les chiffres sont des exemples.

## Ce qui est repris du Daily, sans le refaire

| Élément | Composant existant | Différence en run |
|---|---|---|
| Lecteur | `RoundPlayerComponent` (`gameplay/ui`) | écoute de 10 s d'un coup : pas de bouton « ▶ Xs » ni d'« écouter plus » |
| Saisie | champ avec autocomplétion de la manche (`app-track-round`) | placeholder « Artiste - Titre » avec un tiret simple (le Daily garde « — » tant que Clément n'a pas demandé d'aligner) |
| Valider, Passer, confirmations en ligne | boutons et confirmations de la manche du Daily | aucune |
| Lien « Abandonner » | celui de `daily-progress` (12 px, souligné, discret) | placé à gauche de l'en-tête |
| Forme de la pochette | `reveal-card` (forme organique) | taille 96 px dans la carte de réponse |
| Liste des morceaux | lignes de `track-results-list` (écran « déjà joué ») | sans le clic qui ouvre le graphique, sans la ligne de statistiques |
| Lien Deezer | « ▶ Écouter sur Deezer » du Daily | aucune |

## Écrans du Daily repris tels quels, sans maquette

Clément, 18/10 : un écran qui existe déjà au Daily ne se redessine pas, il se reprend tel quel. Seuls les textes changent (un run n'a ni série ni limite de jour). Les composants qui vivent dans `daily/ui` descendent dans `gameplay/ui` pour que Runs puisse les utiliser (cf. [`conception.md`](conception.md) § 5.3).

| Situation | Écran du Daily | Textes à adapter en run |
|---|---|---|
| Reprise d'une partie en cours | `resume-screen` (« Partie en pause », « X / Y pistes déjà écoutées », Reprendre / Abandonner, confirmation d'abandon sur place) | le compte porte sur les 20 morceaux ; avertissement d'abandon sans la série : « Ton score s'arrête ici, cette playlist ne se rejoue pas. » ; pas de « Ne plus perdre mes parties » (l'accès demande déjà un compte, l'ami invité le garde) |
| « Abandonner » pendant une manche | `ModalService.confirm` de `daily.page` (« Abandonner la partie ? ») | corps : « Ton score s'arrête ici, cette playlist ne se rejoue pas. » |
| Quitter la page pendant une partie | `leave-game.guard` + `ConfirmDialog` (« Partie en cours », « Quitter quand même » / « Continuer à jouer ») | corps : la partie se reprend plus tard, sans limite de jour |
| Extrait illisible (réseau, CDN) | phase `audio-error` de `round-player` (« Réessayer » / « Passer (0 pts) ») | aucun |
| Réponse non envoyée | encart `submit-error` de `track-round` | aucun |
| Erreur avec code | `status-screen`, écran `error` (« Une erreur est survenue » + code d'erreur) | corps : « Impossible de charger la playlist. » |
| Pool trop petit (`runs.no_challenge`) | `status-screen`, écran `no_challenge` | texte à écrire, par exemple « Pas assez de morceaux pour une playlist, reviens plus tard. » |
| Service indisponible | overlay `core/shell/service-down` | aucun, commun à toute l'app |

Sans écran du tout :
- **Accès refusé** (`runs.access_denied` sur `/runs`) : retour au Daily.
- **Lien d'une playlist déjà jouée** (`runs.already_played`) : directement la comparaison (§ 5). À confirmer par Clément.

## 1. La manche

![Manche en cours](maquettes/manche.png)

De haut en bas :
- **En-tête** sur trois colonnes : « Abandonner » à gauche, « MANCHE 2 / 4 » centré, « Score » et le score total du run à droite (accent orange).
- **Bloc objectif** : cadenas et « Débloquer la manche 3 », « 200 / 333 pts » (score de la manche / objectif), barre de jauge en dégradé avec un trait vertical à l'objectif. Sur la dernière manche, le libellé dit l'objectif du disque d'or (texte à fixer au code).
- **5 pastilles** des morceaux de la manche et « Morceau 3 sur 5 » : vert = trouvé, ambre = à moitié (artiste ou titre), corail = morceau en cours, sombre = à venir. Un morceau raté prend la couleur `--danger` (pas dessiné dans les maquettes, déduit).
- **Lecteur du Daily** : « 6.2s / 10s », barre cyan, bouton lecture/pause.
- **Saisie du Daily** : champ « Artiste - Titre » avec propositions, puis VALIDER et PASSER (0 PTS).

Confirmations en ligne, à la place des boutons, comme au Daily :

| Passer | Valider un champ vide |
|---|---|
| ![Confirmation de Passer](maquettes/manche-passer.png) | ![Confirmation d'un champ vide](maquettes/manche-valider-vide.png) |

## 2. La réponse après chaque morceau (nouvelle étape)

![Réponse après un morceau](maquettes/reponse.png)

Après Valider ou Passer, **on reste dans l'écran de la manche** : le lecteur et la saisie laissent place à une carte de réponse, le reste de l'écran ne bouge pas.
- **Carte** aux coins du lecteur (28 / 8 px) : pochette à la forme de la révélation du Daily, **pastille jaune « +67 »** (points du morceau) posée sur le coin de la pochette ; à droite, l'artiste puis le titre, **deux lignes au plus chacun** (coupés au-delà, les noms longs sont fréquents) ; pastilles « ✓ Artiste » (vert) et « ✗ Titre » (rouge) ; dessous, « ▶ Écouter sur Deezer ».
- **Bloc objectif** : « +67 » en vert devant le nouveau score de la manche, et la part gagnée surlignée dans la barre.
- La pastille du morceau prend sa couleur, le score de l'en-tête se met à jour.
- **« MORCEAU SUIVANT »** juste sous la carte. Ce clic lance le son du morceau suivant (geste du joueur, obligatoire sur iPhone). Après le 5e morceau, il mène à la fin de manche (libellé à fixer au code).

## 2b. Le morceau sans extrait

![Morceau sans extrait](maquettes/morceau-neutralise.png)

Quand Deezer n'a plus d'extrait pour le morceau en cours, le serveur le neutralise ([`regles.md`](regles.md#la-jauge)). On reste dans l'écran de la manche ; à la place du lecteur et de la saisie :
- une carte « **Morceau retiré de la manche** » : « L'extrait n'est plus disponible chez Deezer. Ce morceau ne compte pas : l'objectif de la manche passe à 266 pts. » Rien ne révèle le morceau ;
- dans le bloc objectif, l'ancien objectif barré à côté du nouveau (« 200 / ~~333~~ 266 pts »), le repère de la jauge recalculé ;
- la pastille du morceau hachurée (ne compte pas) ;
- « MORCEAU SUIVANT » dessous, comme après une réponse.

À ne pas confondre avec l'extrait illisible (réseau, lien expiré) : là, on garde « Réessayer / Passer (0 pts) » du Daily.

## 3. La fin de manche

![Fin de manche](maquettes/fin-de-manche.png)

- « MANCHE 2 / 4 » en haut, puis l'icône ✓ et **« Manche 2 terminée »**.
- **Bloc objectif** : cadenas ouvert et « Manche 3 débloquée » en vert, « 466 / 333 pts », barre et trait à l'objectif (vert quand il est atteint). Manche ratée : l'objectif manqué, et le bouton mène à l'écran de fin.
- **Les 5 morceaux** dans les lignes de l'écran « déjà joué » du Daily : pochette, ✓/✗ Artiste et Titre, « Artiste - Titre » sur une ligne, points, « ▶ Écouter sur Deezer ».
- **Score total** du run, puis **« Manche suivante »** juste dessous.

## 4. La fin du run

| Victoire | Défaite |
|---|---|
| ![Récap d'une victoire](maquettes/recap-victoire.png) | ![Récap d'une défaite](maquettes/recap-defaite.png) |

Même mise en page dans les deux cas :
- **Carte du disque**, horizontale : le disque dessiné à gauche (or, argent, bronze, cire, rayé) ; à droite, le nom du disque (« Disque d'or ! »), un badge « Nouveau record » ou « Record : 2 617 », le score final en grand, puis **« 16 / 20 morceaux trouvés »** et 20 petits carrés groupés par manche (vert = trouvé ; une manche non jouée en carrés vides).
- **4 cases** « Manche N » avec « score / objectif » ; l'objectif manqué en ambre ; **✕** pour une manche non jouée.
- **Bloc « Lance cette playlist à tes potes »** : « Ils jouent exactement la même playlist que toi : les mêmes 20 morceaux, dans le même ordre. À la fin, vous comparez tous vos scores, manche par manche. » et le bouton **« Partager la playlist »**.
- **« Nouvelle partie »** dessous (un ami sans accès voit à la place une invitation à jouer au Daily).
- Pas de « Voir les morceaux » : la liste a été vue à chaque fin de manche.

## 5. La comparaison d'une playlist

![Comparaison](maquettes/comparaison.png)

- Surtitre **« PLAYLIST DE CLÉMENT »** (pseudo de l'auteur, sans le code du lien), titre **« 4 joueurs de cette playlist »**.
- Tableau : Joueur (pseudo et disque dessous), M1 à M4, Total ; trié par total. **« Toi »** surligné en orange ; **✕** pour une manche non jouée ; « Invité » pour un joueur sans compte.
- **« Partager la playlist »** en bas.

## 6. L'entrée sur l'accueil

| Accueil | Déjà joué |
|---|---|
| ![Carte sur l'accueil](maquettes/accueil.png) | ![Carte sur l'écran déjà joué](maquettes/deja-joue.png) |

- **Seule la carte Platines est ajoutée** : rien d'autre ne change sur ces deux écrans (Clément, 17/10).
- Carte sous le contenu existant (en bas de l'accueil, sous le bloc du score sur « déjà joué ») : disque doré, « Platines », badge « ACCÈS ANTICIPÉ », « Vise le disque d'or. », chevron. Un clic ouvre `/runs`.
- Visible seulement pour un compte qui a l'accès, jamais pendant une manche.

## 7. Le lien reçu

![Lien reçu](maquettes/lien-recu.png)

Ce que voit un ami qui ouvre `inseconds.cc/runs/<code>` sans avoir encore joué cette playlist, invité compris, avec ou sans accès à Platines :
- le logo seul en haut (ni série, ni compte : l'écran doit marcher pour un invité tout neuf) ;
- le disque d'or, le surtitre « PLAYLIST DE CLÉMENT » (pseudo de l'auteur, « Invité » à défaut), le titre « Clément te lance une playlist » ;
- « 20 morceaux, les mêmes pour tout le monde. Tu verras vos scores à la fin de ta partie. » : la comparaison n'est visible qu'après avoir joué (réponse à `runs.comparison_locked`) ;
- trois règles : 4 manches de 5 morceaux de plus en plus durs, 10 s d'écoute pour trouver l'artiste et le titre, l'objectif de chaque manche à remplir ;
- **« JOUER »**, qui crée l'invité si besoin et lance la partie (le son démarre à ce clic) ;
- « Sans compte · une seule partie par playlist ».

Partie déjà commencée sur ce lien : l'écran de reprise du Daily. Partie finie : la comparaison (§ 5).
