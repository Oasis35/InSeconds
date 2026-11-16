# Setlist : les écrans

Format : téléphone d'abord (390 × 844). Les textes sont dans les traductions (`runs.*`, FR et EN). Les écrans de la V4 (accueil, barre du bas, historique, classement, groupes) ont leurs 16 maquettes dans [`maquettes/proto4/`](maquettes/proto4/) et leur description dans [`proto4.md`](proto4.md). Ce document décrit les écrans de **la partie** ; règles : [`regles.md`](regles.md).

## Repris du Daily, sans le refaire

Un écran qui existe déjà au Daily se reprend tel quel, seuls les textes changent (composants dans `gameplay/ui`) :

| Situation | Écran repris | Adaptation |
|---|---|---|
| Lecteur | `RoundPlayerComponent` | écoute d'un seul tenant, durée du palier, ↺ libre, ni « écouter plus » ni indice |
| Saisie | champ avec autocomplétion de la manche | « Artiste - Titre », Valider, Passer (0 pts) avec confirmation en ligne |
| Reprise d'une partie en cours | `resume-screen` | avertissement d'abandon : « Cette partie sera perdue et ne comptera pas pour ton record. » |
| « Abandonner » (✕) | `ModalService.confirm` | même texte |
| Quitter la page en jouant | `leave-game.guard` | la partie se reprend plus tard |
| Extrait illisible | phase `audio-error` | « Réessayer / Passer » |
| Erreur avec code, pool trop petit, service indisponible | `status-screen`, overlay commun | textes `runs.*` |

Sans écran du tout : l'accès refusé (`/setlist` renvoie au Daily) et le lien d'une playlist déjà jouée (directement la comparaison).

## Le fil d'une partie

1. **Accueil du mode** (`/setlist`) : le niveau et l'échelle des disques, le record, « Lancer une partie », la reprise d'une partie en cours, le lien « Hits ».
2. **Manche** : un seul écran en pile.
   - **En-tête** : ✕ (abandonner), les **vies** en cœurs (3), « Manche N » et la pastille du thème, « Écoute N s ».
   - **Carte du morceau en cours** : bouton ↺ à gauche de la forme d'onde, la saisie, Valider, « Passer » (lien souligné sous Valider). Le **chrono de 45 s** s'affiche en gris, les 5 dernières secondes en grand et en blanc avec un tic ; à 0 la réponse tapée part seule.
   - **La pile** dessous : « Total du run » (et, à côté, les bonnes réponses d'affilée), pour qui joue la playlist d'un ami son **fantôme** (son pseudo et son total au même morceau, l'écart ; « Tu bats Léa » au-delà de son score figé), puis les morceaux joués de la manche.
3. **Réponse** : dans la carte, pochette ronde, artiste et titre avec ✓/✗ (une moitié juste en demi-teinte), points du morceau qui s'envolent vers « Total du run », badge Deezer. Enchaînement au clic ou seul après 2 s.
4. **Morceau retiré** : quand Deezer n'a plus d'extrait, la carte devient « Morceau retiré de la manche » ; aucune vie perdue.
5. **Bilan de manche** (écran `palier`) : après chaque manche terminée avec au moins une vie : le score de la manche, les vies restantes, le palier de la suivante (« L'écoute raccourcit / reste la même / rallonge ») et « Manche suivante ».
6. **Choix du thème** (si le serveur en offre un, à partir de la manche 2) : « Choisis ton thème », deux thèmes et « Thème mystère » (tirage décoratif de 1,4 s, rien en mouvement réduit) ; le premier morceau part au clic.
7. **Fin** : dès la troisième vie perdue (ou un abandon) : le disque du niveau et ce que la partie a changé, le score en grand, « Nouveau record » ou le record, le nombre de manches passées, une case par manche, le duel de l'ami en première ligne s'il a fini la playlist, « Rejouer » (« Revanche » en duel) en action principale, « Partager mon score » (grille d'emojis par manche, le palier, le score, « Fais mieux » vers la même playlist), « Défier un ami » et « Voir les autres joueurs », puis « Tes groupes » et la ligne « Hits ». La fin se joue en 2,2 s (un toucher la saute).

Les sons d'interface (manche passée, fin, record, tic du chrono) sont synthétisés, jamais pendant un extrait, et coupés par le haut-parleur de l'en-tête. Animations : GSAP par la façade `ui/motion`, courtes et amorties, coupées en mouvement réduit.

## Le lien d'un ami

`inseconds.cc/setlist/<code>`, sans avoir encore joué cette playlist, invité compris, avec ou sans accès :
- le logo seul en haut (l'écran doit marcher pour un invité tout neuf) ;
- « Léa te lance une playlist » (« Invité » à défaut de pseudo) ;
- un bloc de règles courtes (« Des manches de 5 morceaux… sans fin », « 3 vies », « 45 s pour trouver l'artiste et le titre », « L'écoute reste la même. » : le palier évolue avec la manche) ;
- **« Jouer »** : crée l'invité si besoin et lance la partie, le son démarre à ce clic.

Une partie déjà commencée sur ce lien : l'écran de reprise. Une partie finie : la comparaison.

## La comparaison

- Surtitre « Playlist de Léa », titre « N joueurs de cette playlist ».
- Tableau pleine largeur, sans carte : joueur (pseudo ou « Invité », disque dessous), le score de chaque manche, total dans la police du score ; trié par total ; « Toi » surligné en orange ; ✕ pour une manche non jouée.
- « Partager la playlist » en bas.
- On y arrive en ouvrant le lien d'une playlist déjà jouée et par « Voir les autres joueurs » de la fin. Elle reste fermée tant qu'on n'a pas fini sa propre partie (un abandon compte).

## Les Hits

`/setlist/hits` : la liste des jalons (17), ceux obtenus en couleur. Un Hit gagné depuis la dernière visite arrive avec un temps fort. La ligne « Hits 4 / 17 » est sur l'accueil du mode et la fin d'une partie.
