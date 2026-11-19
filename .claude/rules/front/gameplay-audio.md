---
paths:
  - "src/front/InSeconds.Client/src/app/gameplay/**"
  - "src/front/InSeconds.Client/src/app/core/audio-preview/**"
---
# Domaine gameplay : la manche, le lecteur, la forme d'onde

La manche d'un morceau (écouter, répondre, voir la réponse), partagée par le jeu du jour et la Survie. **`gameplay` n'importe aucun mode** (Sheriff). Les composants `ui/` sont présentationnels ; `TrackResultsListComponent`, `DeezerBadgeComponent`, `ShareButtonComponent` et `ResumeScreenComponent` y vivent parce que les deux modes s'en servent sans s'importer.

## Le mode pilote, la manche ne connaît ni le réseau ni les points

- `domain/track-round.ts` est la machine à états (phases `ready`, `loading`, `playing`, `listened`, `submitting`, `revealed`, `audio-error`, `no-preview`, `submit-error`) : chaque transition rend la manche suivante.
- `withTrackRound()` (`data-access/track-round.store.ts`) porte l'état, les transitions et les ordres au lecteur ; `TrackRoundStore = signalStore(withTrackRound())` est fourni par la page (ou la coque) du mode. `TrackRoundComponent` l'injecte et fournit lui-même son `AnswerSearchStore`.
- Le mode appelle `store.start(config, extraitSuivant)`, écoute `answered` (`RoundSubmission` : palier annoncé, `wasExtended`, artiste, titre), envoie la réponse, puis `store.reveal()` avec le résultat, ou `store.submissionFailed()`. Indice : `hintRequested(niveau)`, le mode interroge le serveur puis `store.applyHints(niveau, indices)`.
- **L'écoute part au serveur depuis le mode** (`PATCH …/listening`) à chaque changement de `chosenSeconds` : le serveur débloque les indices et pose le plancher anti-triche (piège 35). La manche ne le fait pas.
- Politiques fournies par le mode : `ListenPolicy` (paliers, prolongeable ou non, `stake` : calcul des points en jeu, lu par `stakeOf`) et `HintPolicy` (`unlockSeconds`, `kinds`, réglages du serveur). Sans `stake`, pas de points en jeu (Survie) ; le jeu du jour donne `dailyStake`. La manche ne connaît aucun barème. Le front n'invente aucun niveau d'indice : un bouton par niveau de `HintPolicy`, libellé `hintButtonKey`, étiquette révélée `hintLabelKey`.
- Projections de `<app-track-round>` : `[roundCorner]`, `[roundAids]` (au-dessus de la saisie), `[roundTheme]` (tout en haut de la saisie : l'indice du mode), `[roundActions]`, `[roundLinks]` (à côté de « Passer »), `[roundBadge]`, `[roundScore]`, `[roundNext]`, `[roundReveal]`.
- Entrées : `choices` remplace le champ et « Valider » par des réponses à toucher ; `locked` retient la réponse pendant que le mode traite une action (le temps écoulé l'envoie au déverrouillage) ; `RoundConfig.trackKey` signale qu'un autre morceau arrive au même `trackId` (saisie vidée, forme et redemande d'extrait de l'ancien ignorées).
- **Entrée dans le champ** : `AnswerInputComponent` émet `enter`, c'est `TrackRoundComponent.onEnter` qui choisit la proposition en surbrillance en lisant le store à cet instant. L'entrée `highlighted` du champ n'est à jour qu'au cycle suivant : `↓` puis `Entrée` rapides validaient la saisie brute (E2E `autocomplete-keyboard-nav.spec.ts`).
- Le champ ne prend le focus seul qu'avec une souris (`(pointer: fine)`) : sur écran tactile, le clavier couvrirait la manche et iOS ne l'ouvre que sur un geste.
- L'écoute automatique n'a lieu qu'une fois par morceau (`autoStarted`), sinon un retour au repos ramenait le joueur au premier palier.
- Sélecteurs stables des E2E : champ « Artiste - Titre », ✕, « Valider », « Valider quand même », « ▶ X s », « ↺ X s », `round-timer`, `round-skip`, `guess-time-chart` et `data-bucket`. Les changer impose d'adapter les E2E.

## Le lecteur : `AudioPort` et `HtmlAudioPort`

- `AudioPort` (classe abstraite) : `load(url, suivant)`, `playUntil(s)`, `replay(s)`, `playFull()`, `stop()`, `unlock()`, `onPlayPauseKey(handler)`, signaux `state` (`idle`, `loading`, `ready`, `playing`, `finished`, `error`) et `position`. Fourni par `provideGameplay()` dans les `providers` de la route du mode, jamais dans `app.config.ts`.
- `HtmlAudioPort` : un seul élément `Audio` (`playsinline`) **pour toute la page**, partagé entre les instances, lu en flux depuis le CDN de Deezer, aucune bibliothèque (décision dans `docs/architecture/decisions.md`). `unlockSharedAudio()` le déverrouille depuis une autre page (la carte Survie de l'accueil) ; le drapeau de déverrouillage est commun.
- **Le son ne part que dans un clic** : `unlock()` (par `TrackRoundStore.unlockAudio()`) est appelé dans le gestionnaire du clic, **avant tout `await`**. Sur iPhone, un élément ne joue hors d'un geste qu'après avoir joué une fois dans un geste. Sans extrait chargé, il joue un silence de 10 ms en adresse `blob:` (la CSP refuse `data:` pour un son) ; avec un extrait, il le joue en muet puis revient à sa position. Un refus se retente au clic suivant.
- Deux jetons (`loadToken`, `playToken`) invalident les rappels périmés ; un `AbortError` de `play()` (notre `pause()`, un changement de source) n'est pas une erreur.
- Le suivant est seulement annoncé (`<link rel="preload" as="audio">`), rien n'est décodé d'avance. Aucun audio ni pochette Deezer gardé hors du cache HTTP ordinaire (piège 47).
- **Touches multimédia** : tant qu'une manche existe, lecture / pause (Media Session) est branchée sur ↺ (`TrackRoundStore.replay`, jamais au-delà du palier) ; aucune autre action n'a de gestionnaire. `onPlayPauseKey` rend de quoi retirer ce seul branchement.

**Piège 33 : un échec de lecture est `error`, jamais `idle`** - un retour à `idle` relançait l'écoute automatique en boucle. La manche montre « Réessayer / Passer ». Un échec de la lecture complète après la révélation donne `finished`. Tests : `round-player.component.spec.ts`, E2E `audio-error.spec.ts`.

**Piège 40 : « Écouter plus » et relecture** - pendant la lecture, il repousse l'arrêt sans couper ; à l'arrêt, il relit depuis 0 jusqu'au nouveau palier ; pendant le chargement, il est gardé ; la relecture (↺) ne remet pas `wasExtended` à faux. Tests : `html-audio.port.spec.ts`.

**Piège 44 : arrêt du palier calé sur le son réel** - le chrono part à l'événement `playing` pour `palier − currentTime`, est suspendu sur `waiting`, et une boucle `requestAnimationFrame` coupe dès que `currentTime` atteint le palier (10 ms près) et alimente `position`. Un chrono lancé à l'appel de `play()` coupait trop tôt sur mobile. Un extrait plus court que le palier finit le palier. Tests : `html-audio.port.spec.ts`.

**Piège 46 : faux `playing` de Safari** - sur iPhone, `playing` part dès `play()` alors que le son sort plus tard. Le chrono ne coupe jamais à l'aveugle : à l'échéance il relit `currentTime` et se reprogramme (20 ms au moins), et rien ne coupe pendant un `seeking`. Tests : `html-audio.port.spec.ts` (démarrage lent, faux `playing`).

**Piège 14, côté front : adresse d'extrait expirée** - l'adresse signée vit 15 min. Si la `RoundConfig` fournit `refreshPreviewUrl`, le premier échec d'un morceau redemande seul une adresse et relance le palier, sans erreur (`recoverFromAudioError`) ; **une seule fois par morceau**, le second échec affiche « Réessayer / Passer ». « Réessayer » déverrouille d'abord le son dans le clic puis recharge depuis une adresse fraîche. `refreshPreviewUrl` qui rend `null` (extrait retiré par Deezer) passe la manche en `no-preview` (« Passer » sans confirmation). Rien n'est remonté pour une adresse à la signature déjà passée (`isSignatureExpired`). Tests : `track-round.store.spec.ts`, E2E `audio-error.spec.ts`.

Remontées du lecteur, jamais l'adresse de l'extrait : `AudioError: <chargement|lecture>, <cause>` (`describeAudioError`, avec le statut HTTP du CDN lu par `probePreview`) et `AudioStall:` (`describeStall`, diagnostic iPhone à retirer).

## La forme d'onde

**Piège 50, côté front : forme calculée par l'API** - la forme arrive avec le morceau (`TrackSlot.waveform`, `RunCurrentTrack.waveform`, blob base64, `RoundConfig.waveform`) ; `waveformFromBlob` (`domain/waveform.ts`) la lit au `start` (une autre version d'en-tête ou un blob abîmé rend `null`) et la ramène à 60 barres avec le même relief que le calcul navigateur : dessinée dès la première image. Sans elle, repli `WaveformPort` (`DecodedWaveform`) : calcul dans le navigateur à l'événement `playing`, une fois par morceau, jamais en économie de données, `fetch` en `cache: 'no-store'` décodé par un `OfflineAudioContext` (ne touche pas la session audio de l'iPhone), puis Warning `WaveformFallback` (une fois par morceau et par page). **Jamais d'`AnalyserNode` sur la lecture** (pièges 44 et 46). Tests : `waveform.spec.ts`, `track-round.store.spec.ts`, `decoded-waveform.spec.ts`.

- `SmoothPlayhead` (`domain/playhead.ts`) lisse la position pour l'affichage seulement ; l'arrêt reste au lecteur.
- `TrackRoundStore.bass` lit l'enveloppe des basses à `position` (0 à l'arrêt) : `MembraneComponent` fait battre le bouton ↺ et la pochette de la révélation.
- `RoundPlayerComponent` : forme révélée au balayage, couches de barres menées par `transform` seul pendant la lecture (`--wave-locked`, `--wave-unlocked`, `--wave-trail`) ; disposition `inline` pour la Survie (sans repères, points en jeu ni « écouter plus »).

## Fenêtre d'écoute et tests

- `PreviewTrackDialog` (`core/audio-preview/`, admin et jours passés) reçoit l'extrait (`previewUrl`) ou de quoi le demander à l'ouverture (`loadPreviewUrl`) ; piège 42 dans `admin.md`.
- `html-audio.port.spec.ts` joue de vrais sons dans Chromium et simule les démarrages lents de l'iPhone ; stores et composants utilisent `FakeAudioPort`, `FakeWaveformPort`, `makeToneUrl`.
