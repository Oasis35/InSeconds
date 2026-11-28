---
paths:
  - "src/front/InSeconds.Client/e2e/**"
  - "src/front/InSeconds.Client/playwright.config.ts"
  - "src/front/InSeconds.Client/scripts/e2e-*"
---
# E2E (Playwright)

Specs dans `e2e/specs/`, page objects dans `e2e/pages/`, fixtures dans `e2e/fixtures/`. Joués contre l'hôte de test (`InSeconds.Api.Testing` : faux Deezer, faux email, routes `/api/e2e/*`, cf. `.claude/rules/back/test-host.md`). Toutes les specs sont jouées : aucune liste de specs écartées, aucun `test.fixme`.

## Lancer

- En local, `playwright.config.ts` démarre l'hôte de test et `ng serve --configuration e2e` ; la base passe par `E2E_DB_CONNECTION` (chaîne complète, jamais commitée). `npm run e2e`, `npm run e2e:list`, `npm run e2e:ui`.
- **Piège 9** (`--no-launch-profile` pour l'hôte de test) : cf. `CLAUDE.md` racine.
- **Piège 10 : ports** - hôte de test et front sur 5175 / 5176 en CI (`--configuration e2e-ci`, `proxy.e2e.ci.conf.json`), 5177 / 5178 en local (`--configuration e2e`, `proxy.e2e.conf.json`). L'extrait du faux Deezer pointe sur le front de test (`E2E_FRONT_PORT`, 5178 posé en local par la configuration). Un port de front oublié dans `Auth:TrustedOrigins` de l'hôte de test casse silencieusement le lien magique (piège 22).
- `ng serve --configuration e2e` ne relaie pas `/health` : les E2E coupent la sonde (`__disableHealthPolling`) ; pour lancer l'app à la main, utiliser `npm start`.
- `serviceWorkers: 'block'` et `reducedMotion: 'reduce'` dans `playwright.config.ts` ; la fixture `test.ts` pose `__disableAnimations`. En mouvement réduit, l'enchaînement automatique de la Survie est coupé : chaque morceau et chaque manche se lancent par leur bouton.
- **Projet `webkit`** (moteur WebKit, profil iPhone 13) : joué en CI, et en local avec `E2E_WEBKIT=1` après `npx playwright install webkit`. Il ne joue que les tests marqués `{ tag: '@webkit' }` : le son sur un clic (`sound-on-click`), l'échec de lecture (`audio-error`), la partie complète (`happy-path`) et le menu de partage du téléphone (`share-button`). Un test de plus y passe en prenant l'étiquette ; un test qui lit le presse-papier de bureau ou suppose un pointeur fin n'y va pas. Chromium joue toujours tout.

## Données

- `api.reset()` vide tout puis **re-sème le pool** ; `reset({ emptyPool: true })` laisse le pool vide (aucun défi possible), `reset({ deleteChallenge: true })` retire seulement le défi du jour.
- L'admin se connecte par `POST /api/e2e/login-as-admin` ; les données de l'admin viennent de `POST /api/e2e/reseed` (défis à J-5, J-15, J-30… : compter par `AdminPage.apiGetChallengeDates`, pas par une valeur fixe).
- Les liens des emails se lisent dans le dernier email capturé (`/api/e2e/last-email`) ; l'email part de l'outbox après la réponse 204 : attendre un lien différent du précédent.
- `error-reporting.spec.ts` provoque une erreur par `GET /api/e2e/throw`.
- Survie : `api.grantRunAccess` ouvre l'accès ; le tirage est paresseux, `api.latestRunTracks()` ne rend que les morceaux déjà tirés et `RunPage.winRound` le relit à chaque manche ; `api.removePreviews` retire des extraits ; `api.useLegacyRunRules()` pose des manches de 5 morceaux sans vie rendue pour les parcours écrits ainsi (les règles actuelles sont couvertes par les tests d'intégration du back).

## Écrire une spec

- Pas d'`await` dans une boucle (Sonar) : `inSequence` / `times` de `e2e/fixtures/sequence.ts`.
- Les paliers se jouent en temps réel : attendre le temps écouté affiché par le lecteur (`data-testid="round-timer"`, motif `frSeconds` de `blind-round.page.ts`), jamais une attente fixe. Une spec qui écoute jusqu'à 10 s est `test.slow()`.
- Les suggestions de l'autocomplete sont des `role="option"`. Sélecteurs stables de la manche : `gameplay-audio.md`.
- Le son vient de `/test-audio.mp3` (`e2e/public/`), copié par la seule configuration de build `e2e` : jamais dans l'image de prod (vérifié par `scripts/check-nginx-headers.sh`).
- Le menu de partage natif n'existe pas dans Chromium headless : `share-button.spec.ts` le simule.
- Plusieurs joueurs : un contexte de navigateur par joueur (`openOtherDevice`, `signInAgain` de `login.page.ts` ; `groups.spec.ts` en ouvre trois).
- Une page de l'admin rend une seule mise en page (PC à 1280 px) : pas de doublon de `data-testid`.

## Répartition en CI

Six jobs `e2e` dans l'image `mcr.microsoft.com/playwright` ; `scripts/e2e-shard.mjs <n> 6` donne les specs du job n selon leur durée mesurée (`scripts/e2e-weights.json`, une spec nouvelle compte 10 s). Recalcul quand l'écart entre les jobs se creuse ou après l'ajout de specs : `gh run download <run> -p 'playwright-report-*' -D <dossier>` puis `node scripts/e2e-weights.mjs <dossier>`.
