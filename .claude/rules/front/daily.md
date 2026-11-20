---
paths:
  - "src/front/InSeconds.Client/src/app/daily/**"
---
# Domaine daily : le jeu du jour

Le défi du jour, sa série et ses gels, ses statistiques, le partage, l'historique et les réponses des jours passés. Règles du jeu : `docs/regles-du-jeu.md`. `daily` importe `gameplay` et `account` (`SessionLoader`), jamais `runs` ni `social` ; la carte amis puis la carte Survie de l'accueil arrivent par `<app-home-mode-entries>` (jeton `HOME_MODE_ENTRIES` de `core/shell`). Pour un invité, « Créer un compte » de l'accueil est porté par la carte amis (l'état « à jouer » n'a plus son propre bouton) ; quand le jeu du jour montre déjà le sien (toast de série perdue ou d'invité, « Ne plus perdre mes parties » de la partie en pause), la coque le dit à `ShellChromeStore.accountCtaShown` et la carte ne répète pas le bouton.

## Coque et pages

- `DAILY_ROUTES` : la coque `DailyShellComponent` (route parente, `provideDailyApi()` et `provideGameplay()`) et ses trois pages, `HomePage` (`/`), `DailyPage` (`/daily`, garde `leaveGameGuard`) et `DayResultPage` (`/daily/resultat`). `DAILY_HISTORY_ROUTES` (`provideDailyApi()` seul, sans lecteur de manche) : `DailyHistoryPage`, `latestArchiveGuard`, `ReplayPage` (`a-reecouter`) et `EarProfilePage` (`profil`), déclarées avant `:date`, puis `ArchivePage`.
- La coque fournit `DailyGameStore`, `TrackRoundStore`, `DailyShare`, `LostStreakNotice`, `GuestStreakNotice`, et les trois services de `feature/daily-shell/daily-view.ts` : `DailyStartup` (premier chargement : état du jour, puis toast « série perdue » d'un invité), `StreakSheetOpener` (panneau de série), `DailyResultView` (morceaux du résultat, score qui monte, partage). Les stores vivent tant qu'on passe d'une page à l'autre : le son lancé depuis la carte de l'accueil continue sur `/daily`.
- La coque décide de la page : une manche (`playing`) est toujours sur `/daily`, tout écran d'accueil (`isHomeScreen`) est sur `/` (`replaceUrl`, query string gardée), pour tous les joueurs ; le résultat complet (`/daily/resultat`, `DayResultPage`) n'existe qu'une fois le défi fini (`isRecapScreen`), sinon retour à `/`.
- **L'accueil a une seule tuile du moment** (la prochaine action) : défi à jouer, la carte du défi (`home-challenge-card` : le bloc de l'accueil d'avant la V4, avec la règle en une phrase pour qui n'a fini aucune partie, `firstGame`), puis la carte amis et la carte Survie. Défi fait : la carte Survie passe devant (`<app-home-mode-entries placement="lead">`, entrée `leadsWhenDailyDone`, vraie quand sa carte s'affiche) ; l'emplacement le dit (`hasLeadingEntry`) et le résultat court (`home-done-card`) n'est la tuile de focus, « Partager » plein, que sans elle (`focus`). « Voir le résultat » ouvre `/daily/resultat`. La règle des pages est `redirectFor` (`domain/daily-screen.ts`).
- La coque pose dans `ShellChromeStore` `immersive` (manche en cours) et `dailyDone` (`welcome` / `resume_prompt` : faux, `done` / `already_played` : vrai), remis à faux à sa destruction.
- Il n'y a plus d'attente du flag : la coque V4 est pour tout le monde, seule la carte Survie de l'accueil attend l'accès (elle apparaît quand il est lu).
- Rechargement pour une nouvelle version (`reloadMomentFor`, `feature/reload-moment.ts`) : `navigation` en manche, `background` sur `done` (il couperait la montée du score et les toasts) et `loading`, `now` ailleurs.

## `DailyGameStore`

- **Machine des écrans** dans `domain/daily-screen.ts` (`DailyScreen` : `loading`, `welcome`, `resume_prompt`, `playing`, `done`, `already_played`, `no_challenge`, `error` ; `screenAfterToday`, `refocusContext`).
- **Le son ne démarre que sur un clic** : `begin()`, `nextTrack()` et `retryNoChallenge()` commencent par `round.unlockAudio()` **avant tout `await`** ; jamais l'arrivée sur la route, un `effect` ni le retour de l'onglet. Une reprise après rechargement passe par l'écran de reprise. E2E `sound-on-click.spec.ts`.
- **Identité** : `begin()` crée l'invité (`SessionLoader.ensureGuest`) avant `POST /api/daily/sessions`, qui exige un cookie ; la lecture de l'état du jour ne crée rien.
- **Écoute** : un `effect` envoie chaque palier choisi (`PATCH …/listening`) sans jamais lancer de son ; les envois se suivent et une demande d'indice attend le dernier (piège 35).
- **Reprise** : plancher d'écoute et indices déjà payés reviennent dans la `RoundConfig` ; `refreshPreviewUrl` reprend la partie pour une adresse fraîche (piège 14).
- **Retour de l'onglet** (`refresh()`, sur `visibilitychange`) : relit l'état ; une partie finie ou abandonnée ailleurs mène au résultat ou à l'écran d'abandon, jamais à l'accueil en pleine partie. `beforeunload` et `leaveGameGuard` protègent une partie en cours ; une confirmation ouverte se ferme seule si la partie finit entre-temps.
- **Fin de partie** : la série est relue après la dernière réponse. Pochette et lien Deezer n'existent qu'avec la réponse (pièges 31 et 47).
- **Toasts de série d'un invité** (règles dans `domain/toasts.ts`) : « série perdue » une fois par série perdue (`LostStreakNotice`, `announceLostStreak`) ; bandeau « crée un compte » aux `GUEST_STREAK_INTRO_GAMES` premières parties tant qu'il n'est pas fermé, puis seulement au palier d'un gel (`GuestStreakNotice`, `restoreStreakToastDismissal`). Le stockage local reste hors du store, dans ces deux services.
- Le profil n'affiche ni série ni gels : la série vit sur les écrans du jeu (`StreakPillComponent`, panneau `StreakSheetComponent` par `ModalService.openSheet`).

**Piège 32 : réponse perdue sur coupure réseau** - `DailyApi.submitAnswer` réessaie 2 fois une coupure ou un 5xx, jamais un 4xx ; un échec définitif remet la manche en « Réessayer » sans rien enregistrer ni afficher de faux résultat (`store.submissionFailed()`). `RunsApi.submitAnswer` suit la même règle. Tests : `daily.api.spec.ts`, `daily-game.store.spec.ts`.

**Piège 41 : statistiques du jour en échec** - `stats/today` est lu en entrant sur un écran de fin ; un échec le met à `null`, l'écran s'affiche sans, et l'erreur n'est pas remontée deux fois. Tests : `daily-game.store.spec.ts`.

## Résultat du jour et partage

- Un seul écran de résultat (`DayResultScreenComponent`) juste après la partie (`done`) et aux visites suivantes (`already_played`) ; seuls changent le score qui monte (`displayedTotal`) et les toasts. `data-fresh` distingue les deux pour les E2E. L'abandon a son écran (`abandoned-screen`, `home-abandoned-card`). L'accueil montre le résultat court (`home-done-card` : score, compte à rebours, barres, moment fort, partage, série) ; l'écran entier est sur `/daily/resultat`.
- **Moment fort** (`domain/highlight.ts`, calculé sur les histogrammes, sans appel) : un morceau trouvé qu'au plus 25 % des joueurs ont trouvé aussi vite, sinon un morceau trouvé raté par la moitié des joueurs, seulement sur les morceaux d'au moins 5 joueurs ; sinon « mieux que X % » du serveur ; `historyHighlightOf` sur la carte de l'accueil. Seul l'artiste est nommé, et la phrase n'entre jamais dans le texte partagé.
- **Texte partagé** (`DailyShare`, `domain/share-text.ts`) : en-tête `daily.share.header` (score au format de la langue, date du jour de jeu UTC, jamais l'horloge du joueur), une ligne par morceau répondu (`shareLines` : ✅/❌ artiste, ✅/❌ titre, palier écouté), puis `SHARE_LINK`. Le palier est mis en forme par `formatSeconds`, passé par la page (ni `domain` ni `data-access` ne voient `ui`). Ni nom de morceau ni emoji décoratif. Sur « déjà joué », le bouton reste grisé tant que les stats du jour ne sont pas là. Le partage passe par `ShareService` (`core-pwa.md`).
- Dates et compte à rebours : `core/game-day/game-day.ts` (`todayUtc`, `yesterdayUtc`, `timeLeft`, `formatCountdown`), toujours en jours UTC.

## Réponses des jours passés (`ArchivePage`)

- `ArchiveStore` lit `GET /api/daily/archive/{date}` (public, en cache, que des pourcentages) et `…/me` (la partie du navigateur, jamais en cache, ne crée rien ; un échec n'empêche rien). Le seuil de 5 joueurs n'existe que côté serveur. Les réponses s'affichent **d'office**, même pour un jour qu'il n'a pas joué : rien n'est caché derrière un bouton (pas de mode entraînement, `docs/architecture/decisions.md`).
- Lignes compactes (`ArchiveTrackRowComponent`) : le détail (stats des joueurs, histogramme, écoute, badge Deezer) s'ouvre au toucher. L'écoute se fait **sur place** par l'`AudioPreviewPlayer` fourni par la page, avec une adresse **demandée à chaque nouvelle écoute** (`ArchiveStore.previewUrl`), jamais gardée (piège 14) ; un second toucher met en pause.
- « Tes amis ce jour-là » arrive par `<app-day-friends-slot>` (jeton `DAY_FRIENDS_SLOT` de `core/shell`, rempli par `provideSocial()`) : le Daily ne voit pas les groupes. « Jouer le défi du jour » seulement si `ShellChromeStore.dailyDone` est faux. « ‹ Historique » ramène au mois du jour (`?mois=`).
- Domaine pur `domain/archive.ts` (types, dates dans la langue en UTC). Titre et description de la page (`PageMetaService.setPageText`) nomment le jour et ses artistes et reviennent à ceux du site en quittant la page (`resetPageText`) ; la date est le seul `h1`, le logo devient un lien (`homeLink`).

## Historique du joueur

`DailyHistoryPage` (`/history/daily`, `?mois=aaaa-mm`) : la tuile du défi d'aujourd'hui (tuile de focus s'il reste à jouer), la carte du profil (`EarProfileCardComponent`, s'il a joué sur 8 semaines), le calendrier du mois (`HistoryCalendarComponent`, règles pures dans `domain/history.ts` : `calendarWeeks`, `scoreTint`, `dayLink`) et l'entrée « À réécouter ». Stores fournis par la page : `DailyHistoryStore`, `EarProfileStore`. La Survie a sa propre page (`RunHistoryPage`), les deux reliées par les onglets de `ui/history/` et les formats de `ui/format/day-label.ts` (les modes ne s'importent pas). Sans identité, `GET /api/daily/history` rend le calendrier, tous les jours en « pas joué » ; une case d'aujourd'hui (jouée ou non) et la veille encore en cours (`resumable`) mènent au défi, jamais aux réponses (`dayLink`).

- **À réécouter** (`ReplayPage`, `ReplayStore`, `domain/replay.ts`) : pages de dix jours (`loadMore`), un filtre relit la première page, compteur `latest` contre les réponses périmées. Même écoute sur place que la page d'un jour ; le lecteur du bas (cadre cyan, la tuile de focus) porte le badge Deezer.
- **Profil d'oreille** (`EarProfilePage`, `EarProfileStore`, `domain/ear-profile.ts` : `chartLine`, `chartBounds`, `favouriteStep`) : la courbe est `EarProfileChartComponent` (SVG, sa moyenne en ambre, les joueurs en pointillé violet). Sur le résultat du jour, `GameProfileCardComponent` lit les champs de `stats/today` (`averageScoreAfter`, `bestSinceDays`, `firstStepFound…`), sans appel de plus ; jamais la tuile de focus.

## Composants

`ui/` ne voit aucun service de `core/` : langue, série et identité arrivent par des entrées. Les toasts de série utilisent le cadre `ui/toast-frame` (liseré orange pour la série, cyan pour le gel). Les accès de l'en-tête sont projetés dans `[brandRight]` du bandeau (`<app-account-link>`) et disparaissent en pleine manche : un toucher par erreur ouvrirait la confirmation de sortie. Le badge Deezer projeté dans `[roundBadge]` se place par rapport à la carte de révélation (`relative`), jamais par rapport à la page, sinon il remonte sur le logo.

Tests à connaître : `daily-game.store.spec.ts`, `daily-screen.spec.ts`, `highlight.spec.ts`, `share-text.spec.ts`, `toasts.spec.ts`, `archive.store.spec.ts`, `history.spec.ts`, `replay.store.spec.ts`, `archive.page.spec.ts` ; E2E `happy-path`, `resume-game`, `streak-freeze`, `archive`, `share-button`, `multi-tab`.
