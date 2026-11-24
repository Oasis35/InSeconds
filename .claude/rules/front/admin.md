---
paths:
  - "src/front/InSeconds.Client/src/app/admin/**"
  - "src/front/InSeconds.Client/src/app/core/audio-preview/**"
  - "src/front/InSeconds.Client/src/app/core/layout/**"
---
# Domaine admin

Rôle `is_admin` uniquement (piège 5). L'API revérifie l'accès à chaque requête : l'écran d'accès de la coquille n'est qu'un confort. `admin` importe `account` (`BrowserIdComponent`) et `gameplay` (`GuessTimeChartComponent`).

## Routes et fournisseurs

- `ADMIN_ROUTES`, sept onglets chargés à la demande : `dashboard` (arrivée), `defis`, `catalogue` (Morceaux), `themes`, `a-valider`, `groupes`, `joueurs`. Anciennes adresses : `/admin` (et `?tab=`) → l'onglet demandé ou `dashboard`, `pool` et `actions` → `catalogue`, un onglet inconnu → `dashboard`.
- L'onglet « Contenu » de la barre regroupe `catalogue`, `themes` et `a-valider`, reliés par `ContentTabsComponent` (`ui/content-tabs`) ; l'onglet est allumé par l'adresse (`AdminTab.alsoActive`, `AdminShellPage.isActive`), pas par `routerLinkActive`. Onglets dans `ADMIN_TABS` (`feature/admin-tabs.ts`).
- `provideAdminApi()` (`data-access/admin-api.providers.ts`, dans les `providers` de la route) : clients `AdminClient`, `CatalogueClient`, `DailyClient`, `RunsClient`, `SocialClient`, leurs adresses, `JOBS_DASHBOARD_URL` et tous les adaptateurs de l'admin.
- Rangement : un dossier par onglet dans `feature/` (sa page, ses fenêtres en sous-dossiers) et dans `ui/` ; l'onglet des morceaux s'appelle `pool/` dans les deux couches (page `CataloguePage`, route `catalogue`).

## Règles communes

- **Chaque onglet ne charge ses données qu'à son ouverture** (vérifié par un E2E). Stores fournis par la page ; `AdminCounts` (à la racine, les pages étant détruites au changement d'onglet) garde les effectifs des onglets et les oublie quand le joueur de la session change.
- **Aucune mutation locale** : après chaque action, la liste est relue ; une action rend l'erreur à afficher dans sa fenêtre, ou `null`.
- **Fenêtres par `ModalService` avec `injector: inject(Injector)`** : sans lui, le CDK Dialog ne voit que la racine et ne trouve pas `PoolStore`.
- **Deux mises en page** (`lg`, 1024 px) : le jeton `WIDE_SCREEN` (`core/layout/wide-screen.ts`, signal sur `matchMedia`, remplacé dans les tests) choisit celle que la page **rend**. Une seule à la fois : deux copies cachées par CSS doubleraient les `data-testid` (les E2E tournent à 1280 px, donc sur la mise en page PC).
- Mise en page : la coquille met le `<router-outlet>` dans un bloc `w-full` (seul dans la colonne flex, il doublerait l'écart) ; une page prend toute la largeur (`host: { class: 'flex w-full min-w-0 justify-center' }`), sinon elle prendrait la largeur de son tableau et déborderait d'un téléphone au lieu de faire défiler le tableau seul.
- Chaque onglet retrouve sa position de défilement pendant la visite (`rememberTabScroll`, `tab-scroll-memory.ts`), après le retour en haut du routeur.
- État d'un onglet dans l'adresse quand il se partage : `?jour=`, `?mois=`, `?view=`, `?page=` (à partir de 1, `replaceUrl`), `?theme=`, `?extrait=absent` (effacé après lecture).
- Rechargement pour une nouvelle version : `background`, sauf quand un champ de texte a le focus (`navigation`).
- Codes d'erreur `admin.*` dans `ERROR_MESSAGE_KEYS`. Seules adaptations locales : le recalcul des stats lit `common.not_found` comme « aucun défi ce jour », la ligne « Demain » reconnaît `admin.pool_insufficient`.
- RGPD : l'email d'un joueur est masqué sur PC (`maskEmail`) jusqu'au clic, absent des cartes du téléphone ; le filtre cherche quand même dans l'adresse complète.

## Morceaux, thèmes, sas

**Piège 28 : filtre texte sur plusieurs champs** - le filtre du pool teste l'artiste, le titre **et `artist + ' ' + title`** (`domain/pool-filters.ts`), sinon « Artiste Titre » ne trouve rien. Vaut pour tout nouveau filtre multi-champs. Tests : `pool-filters.spec.ts`.

- `PoolStore` porte liste, filtres, tri, page, sélection et toutes les actions du pool et des thèmes. `statusOf` (désactivé d'abord, puis utilisé ou disponible) sert la colonne, le filtre et les compteurs. Registre des vues `domain/pool-views.ts` (`POOL_VIEW`, `MODE_VIEWS`) : un mode s'y ajoute et apparaît dans le sélecteur, le filtre « Joué par » et les pastilles sans autre changement.
- **Extraits manquants** : la colonne Preview dit depuis combien de jours (`missingDays`, rien sous un jour : le couac d'une nuit) ; le filtre « Manquante depuis 3 j ou plus » (`LONG_MISSING_DAYS`) et le tri par extrait (le plus ancien d'abord) s'appuient sur `previewMissingSince`. « ↻ » sur une ligne manquante et « Revérifier (N) » sur la sélection appellent `PoolStore.recheckPreviews` (groupes de `RECHECK_MAX_PER_REQUEST`, pool relu ensuite, bilan quelques secondes, `answered` faux = Deezer n'a pas répondu, état inchangé).
- Un morceau utilisé ne se supprime pas (« Désactiver » le remplace) ; un morceau du défi du jour ne se désactive pas ; renommer reste permis, avec avertissement.
- `CatalogueApi.findPreviewUrl` redemande l'extrait à Deezer à chaque écoute : le pool ne garde pas d'adresse signée.
- Thèmes (`domain/themes.ts`) : un morceau est jouable s'il a un extrait et n'est pas désactivé. Rouge sous `MIN_PLAYABLE_TRACKS` (7), jaune jusqu'à `VARIED_FROM_TRACKS` (14), vert au-delà : des constantes du front, non dérivées des réglages ; le serveur décide seul s'il propose un thème. Comptes calculés sur le pool déjà lu (`themeRows`).
- Import d'un classement (`domain/theme-import.ts`) : `parseClassification` puis `previewImport` montre l'aperçu avant tout écrit ; l'import **n'ajoute que des liens**, ne retire rien et ne crée aucun thème. Export `poolToCsv`.
- Icônes de thème : stock tenu à la main dans `ui/theme-icon/theme-icons.data.ts` (copié de `lucide-static`, licence ISC) ; un nom hors du stock n'affiche rien. `ThemeIconComponent` est partagé avec la Survie.
- Sas « À valider » (`CandidatesStore`) : relit la liste toutes les `CANDIDATES_POLL_MS` tant qu'un candidat attend sa lecture chez Deezer ou son ajout, puis s'arrête (minuteries libérées dans `withHooks`). Le ▶ remplace la pochette (aucune image Deezer, piège 47) et demande l'adresse à l'ouverture (`candidatePreviewUrl`). Import borné par `MAX_CANDIDATE_IMPORT`.

**Piège 42 : réponse Deezer tardive dans la fenêtre d'écoute** - fermer `PreviewTrackDialog` (`core/audio-preview/`) arrête le son, et une adresse d'extrait arrivée après la fermeture ou après l'ouverture d'un autre morceau ne relance rien. `AudioPreviewPlayer` (un son à la fois, aucun audio gardé) est fourni par la page qui ouvre la fenêtre (`CataloguePage`, `ThemesPage`, `CandidatesPage`, `ArchivePage`). Tests : `preview-track.dialog.spec.ts`, `audio-preview.player.spec.ts`.

## Coquille et panneau technique

- `SystemStore` (fourni par la coquille, chargé une fois l'admin reconnu) lit en parallèle `SystemApi`, `JobsApi` et `GithubCiApi` ; une lecture en échec n'empêche pas les autres. `alertCount` compte les alertes du bouton d'état.
- `GithubCiApi` lit l'API publique de GitHub sans jeton ni cookie (`credentials: 'omit'`), gardée 2 min (60 lectures par heure et par IP) ; `https://api.github.com` est dans la `connect-src` de la CSP.
- Commit et heure du déploiement du front : `core/build/deployed-at.ts` (`ng build --define`, arguments de build exportés par `deploy.sh`, piège 25) ; sans définition (`ng serve`, tests, E2E) : « Build local ». Jeton `FRONT_BUILD` pour les tests. Seuils dans `domain/` (`BACKUP_MAX_AGE_HOURS`, `NIGHTLY_JOBS`, `cooldownTone`).
- Rien ne se lance depuis le panneau : une tâche se lance depuis `/jobs` (Hangfire).
- Joueurs : l'interrupteur d'accès Survie (`role="switch"`, `data-testid="run-access"`) vaut aussi pour un admin, qui n'a pas l'accès d'office (`canPlayRuns` ne lit que la liste des comptes autorisés) ; un échec le remet à son état. Un admin qui change son propre accès le voit sur l'accueil après un rechargement (`SetlistAccessStore` ne lit l'accès qu'une fois par compte).

- Groupes : comme un compte de l'onglet Joueurs, un clic sur le nom ou le nombre de membres déplie le groupe (un seul à la fois, `AdminGroupsStore.toggle`) : ses membres, relus à chaque dépliage, puis la **modération** (renommer, remettre à zéro, supprimer), qui n'existe donc que dépliée. Remettre à zéro et supprimer gardent leur confirmation sur place, et replier le groupe l'annule (`GroupRowComponent`).

Tests : un `.spec.ts` par store et par page ; `renderHost` (`ui/testing/host.ts`) pour les composants de présentation, `content-tabs.stub.ts` pour les pages dont le test moque le `Router`. E2E : `admin.spec.ts`, `admin-themes.spec.ts`, `admin-candidates.spec.ts`, `admin-groups.spec.ts`.
