---
paths:
  - "src/front/InSeconds.Client/src/app/runs/**"
  - "src/front/InSeconds.Client/src/app/social/**"
  - "src/front/InSeconds.Client/src/app/core/shell/shell-chrome.store*"
  - "src/front/InSeconds.Client/src/app/core/shell/bottom-bar-slot/**"
  - "src/front/InSeconds.Client/src/app/core/shell/home-mode-entries/**"
  - "src/front/InSeconds.Client/src/app/core/shell/daily-done-loader.ts"
  - "src/front/InSeconds.Client/src/app/daily/feature/provide-daily-status*"
---
# Domaines runs et social, coque de l'interface Survie

Règles du mode : `docs/runs/`. À l'écran le mode s'appelle « Survie » et un défi une « playlist » ; dans le code, `runs`, `Run…`, `Setlist…`.

## Frontières

- `runs` importe `gameplay`, `account` (`SessionLoader` : le lien d'un ami crée son invité) et `social` (feuille de partage, groupes sur la fin de partie) ; jamais `daily`.
- `social` n'importe aucun domaine : il dessine un disque par un point coloré (`badgeColor`, `var(--disc-…)`) sans importer `runs`, le bandeau vient de `ui/brand`. Le profil (`account`) n'a qu'un lien vers `/ranking?view=general&edit=name`.
- `RUNS_ROUTES` : `provideRunsApi()`, `provideSocialApi()`, `provideGameplay()`, gardes `leaveRunGuard`. `RUNS_HISTORY_ROUTES` : `provideRunsApi()` seul. `SOCIAL_ROUTES` : `provideSocialApi()`.

## La coque de l'interface Survie

L'interface Survie (barre du bas, accueil à deux cartes, historique, classements) est réservée aux comptes qui ont l'accès Survie ; tous les autres joueurs (invités, comptes sans accès, donc la prod hors testeurs) gardent l'interface sans barre du bas. Les deux branches sont vivantes.

- **Le flag** : `SetlistAccessStore` (`runs/data-access/setlist-access.store.ts`, à la racine, instancié au démarrage par `provideRuns()`) lit `hasAccess` de `GET /api/runs/me` une fois par compte, jamais pour un invité ; une erreur vaut « non ». Client chargé à la demande dans un injecteur jetable, derrière `SETLIST_ACCESS_LOADER`. Un invité qui se connecte repasse `loaded` à faux le temps de relire. C'est l'accès Survie posé par l'admin, pas un flag à part.
- **`ShellChromeStore`** (`core/shell`, à la racine) : ce que les pages se disent sans s'importer. `v4` / `v4Known` (l'interface Survie est active / le flag est lu, poussés par `SetlistAccessStore`), `immersive` (une manche est en cours : la barre disparaît), `dailyDone` (défi du jour joué, `null` si inconnu). **Tant que `v4Known` est faux, les pages montrent un chargement neutre** : jamais l'ancien accueil qui change de forme une seconde plus tard.
- **Jetons de `core/shell`** remplis par les domaines : `HOME_MODE_ENTRIES` (multi : la carte Survie, `RunsHomeEntryComponent`, sous l'accueil du jeu du jour), `BOTTOM_BAR_SLOT` (`SetlistBottomBarComponent`, `runs/feature/v4-shell`, chargé à la demande et posé dans `app.html`), `DAILY_DONE_LOADER` (rempli par `provideDailyStatus()` : à l'arrivée directe sur `/survie`, lit si le défi est joué par un client Daily dans un injecteur jetable).
- **Barre du bas** : quatre entrées (Accueil, Classements, Historique, Mon compte ou Connexion), absente sans l'interface Survie, en manche (`immersive`) et hors des pages du jeu ; elle pose la classe `has-bottom-bar` sur `<html>`. Sous l'interface Survie, `<app-account-link>` ne garde que le cadenas admin et le pied de page du jeu du jour devient une ligne légale (`ui/legal-line`).

## `RunGameStore`

- **Le serveur décide de tout** (points, vies, palier, neutralisation d'un morceau, thème, fin) : le front affiche ce qu'il rend (`domain/run.ts`). Le palier reste en place après une vie perdue et raccourcit après une manche sans vie perdue : c'est le serveur qui le donne (`current.listenSeconds`).
- **Écrans** (`RunScreen`) : `loading`, `welcome`, `theme`, `link`, `resume`, `playing`, `palier`, `finished`, `pseudo`, `comparison`, `access_denied`, `no_challenge`, `not_found`, `link_blocked`, `error`. Sans accès : `access_denied` sur `/survie`, que la page traduit en retour à `/daily` ; `link_blocked` sur `/survie/<code>` (lien d'un ami ouvert sans accès), un écran qui ne mène qu'au jeu du jour, jamais à une création de compte. L'accès est vérifié par le serveur, jamais par un garde.
- **Le son ne démarre que sur un clic** : `begin()`, `playLink()`, `next()`, `continueFromPalier()`, `playAgain()` commencent par `round.unlockAudio()` **avant tout `await`**. Depuis l'accueil, « Jouer » de la carte Survie déverrouille l'élément partagé dans son clic (`unlockSharedAudio`) et ouvre `/survie?go=1`, où `RunsPage` lance la partie et retire le paramètre.
- **Manche** : `ListenPolicy { steps: [écoute du palier], extendable: false }`, aucune politique d'indice, relecture ↺ permise. L'extrait n'arrive que morceau par morceau (piège 31). Disposition `inline` du lecteur.
- **Chrono** (`Runs:AnswerSeconds`) : annoncé au premier son (`startClock`), recalé sur le serveur, repris de `clockRemainingSeconds` ; à 0, la manche envoie ce qui est tapé. Le serveur fait foi.
- **Étapes** (`playSteps`) : réponse révélée, morceau retiré. Chaque étape attend un clic ou l'enchaînement de `AUTO_NEXT_MS` (coupé en mouvement réduit, donc en E2E). Une manche finie mène à `palier`, puis à `theme` si le serveur offre un choix (`session.themeChoice`), le premier joueur arrivé fixant le thème pour tous.
- **Synchronisation entre onglets** et retour au premier plan : partie relue, ignorée si `progressKey` n'a pas bougé.
- Rechargement pour une nouvelle version (`feature/reload-moment.ts`) : `navigation` en manche, `background` sur `loading`, `finished`, `palier`, `pseudo`, `now` ailleurs.
- `RunsApi` : `launch()`, `join()` rendent une issue typée ; `submitAnswer` réessaie comme le jeu du jour (piège 32, `daily.md`). Un disque absent de l'API devient `NO_DISC` dans l'adaptateur ; 7 disques (`DISC_LADDER` de `run-home-card`).
- `RunSounds` : sons d'interface synthétisés, jamais pendant un extrait, sans bouton pour les couper (on écoute de la musique pour jouer).
- **Écran de jeu** : `run-header` n'a que le logo et « Abandonner », comme au défi (ni ✕, ni haut-parleur, ni cœurs) ; `run-scoreboard` porte « Manche N » et ses pastilles, le score et les vies en cœurs rouges ; le thème de la manche est projeté par `[roundTheme]` dans la carte du morceau, juste au-dessus de la saisie.
- **Hits** : calculés par le serveur (`RunsApi.hits()`), plus celui des groupes (`withGroupHit`, lu par `SocialApi`). « Nouveau » est tenu par le navigateur (`StoragePort`, clé `inseconds.hits.seen`) : la ligne des Hits ne marque rien (`load(false)`), l'écran des Hits marque ce qu'il montre (`load(true)`).
- **Défi d'un ami** : ouvrir `/survie/<code>` appelle `RunsApi.receive` sans attendre (un échec ne change rien) ; la carte Survie lit `received` de `GET /api/runs/me`.

## Social

- `SocialApi` : `create`, `join`, `invitation` rendent une issue typée (`ok`, refus nommés, `invitation_not_found`, `error`). `GroupsStore` et `GeneralRankingStore` relisent après chaque action, aucune mutation locale.
- `PendingInvite` garde dans le navigateur (`StoragePort`, `inseconds.pendingGroupInvite`) une invitation reçue sans compte ; `RunsPage` y range le `?group=` d'un lien de playlist.
- `GroupShare` et `RunShareSheetComponent` (`ModalService.openSheet` avec l'injecteur de la page) partagent par `ShareService`, **dans le clic** (le menu natif refuse un appel après un `await`).
- `HomePlaceReader` lit une fois la place du joueur (meilleur groupe, rang au général) pour la carte de l'accueil ; `movementOf` déduit « Tu passes devant… » du classement et du changement de niveau de la partie, sans état gardé.
- Classement général : `?view=general` de `RankingPage`, choix pseudo ou alias par `RankingNameSheet` (`?edit=name` l'ouvre au chargement).
- Seuls les membres d'un groupe voient ses pseudos : le front ne montre jamais un pseudo hors d'un groupe ou du classement général.

Tests à connaître : `run-game.store.spec.ts`, `run.spec.ts`, `setlist-access.store.spec.ts`, `shell-chrome.store.spec.ts`, `setlist-bottom-bar.component.spec.ts`, `runs.page.spec.ts`, `run-share.spec.ts`, `groups.store.spec.ts` ; E2E `runs.spec.ts`, `groups.spec.ts`.
