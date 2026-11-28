---
paths:
  - "src/front/InSeconds.Client/src/app/account/**"
  - "src/front/InSeconds.Client/src/app/core/session/**"
  - "src/front/InSeconds.Client/src/app/core/download/**"
---
# Domaine account : identité, connexion, profil

Connexion par lien magique, vérification du lien, profil, appareils, confirmation de changement d'email, droits RGPD. `account` n'importe aucun autre domaine ; `daily` et `runs` l'importent pour `SessionLoader`, l'admin pour `BrowserIdComponent`.

## Démarrage et session

- **Seul domaine fourni au démarrage** : `provideAccount()` (dans `app.config.ts`) donne l'adresse de l'API au client Players (`providePlayersApi()`), lit la source d'arrivée avant toute navigation et lance la lecture de l'identité sans bloquer l'affichage. `PlayersApi`, `SessionLoader` et `ArrivalSourceService` sont à la racine.
- `SessionStore` (`core/session`, à la racine) : le joueur courant (id, pseudo, email, invité ou compte, admin), rempli par `account` seulement.
- `SessionLoader` lit l'identité une fois au démarrage et la relit à la demande ; **seule la lecture la plus récente écrit dans la session**. `ensureGuest` crée l'invité (`POST /api/players/guest`) avec sa source d'arrivée, appelé par un mode juste avant sa première partie : **lire l'état du jour ne crée jamais de joueur**.
- `PlayersApi` : `GET /api/players/me` sans identité répond 204, que le client lève en erreur et que l'adaptateur traduit en `null`.
- Source d'arrivée (`domain/arrival-source.ts`, `ArrivalSourceService`) : le `utm_source` de l'adresse, sinon le domaine seul du référent sans `www.`, rien depuis le site lui-même ; notée dans `sessionStorage` (`inseconds.arrivalSource`), la première de l'onglet reste, accès sous `try/catch`.
- `linkedAccountGuard` (profil) attend la lecture de l'identité avant de décider.

## Lien magique

**Piège 21 : scanners de liens dans les emails** - le lien magique et le lien de changement d'email ne se consomment **jamais** à l'ouverture de la page, seulement au clic sur « Confirmer ». Tests : specs `verify` et `confirm-email`, E2E `login.spec.ts`, `change-email.spec.ts`.

**Piège 30 : lien ouvert dans un navigateur déjà connecté** - le compte connecté n'est jamais converti ; la page prévient avant de confirmer le lien d'une autre adresse (« Ton compte actuel ne sera pas modifié »). Tests : `verify.store.spec.ts`, `verify.page.spec.ts`.

- `domain/verify-flow.ts` est la machine à états de la vérification, enveloppée par `VerifyStore`. Une adresse sans compte passe par l'étape `new-account` avant le pseudo : « Créer mon compte » (`createAccount`, aucun appel, le pseudo ensuite) ou « J'ai déjà un compte » (`/account/login?hint=existing`, jeton ni consommé ni invalidé).
- Correction d'un domaine mal tapé (`suggestEmail`, `domain/email.ts`, bibliothèque `@zootools/email-spell-checker` déclarée dans `allowedCommonJsDependencies`, chargée avec les routes du compte seulement) : liste fixe de domaines, **aucune requête**. Comparer à des adresses en base serait une énumération. Une faute avant le « @ » ne se voit pas, c'est voulu. Le front ne dit jamais à la saisie si une adresse a un compte.
- « Renvoyer le lien » est grisé pendant `RESEND_DELAY_MS` (`domain/resend.ts`), la minute du serveur : avant, l'API répondrait 204 sans rien envoyer. `LoginStore` garde `sentTo`, `sentAt`, `resent`.
- L'étape du pseudo prévient qu'il apparaîtra au classement général (`account.verify.rankingInfo`). Règles du pseudo dans `domain/pseudo.ts`, mêmes bornes et caractères que le back.

## Profil et droits RGPD

- Le profil est un écran technique en quatre cartes (Compte : pseudo et email avec libellés visibles ; Appareils ; Préférences : langue, puis le nom au classement général avec l'accès Survie ; Tes données), puis « Se déconnecter » en contour neutre. Ni titre visible (un `h1` masqué), ni en-tête d'identité, ni liens légaux : ils vivent sur les pages d'entrée par `home-legal-line`.
- Appareils repliés à chaque visite (`devicesOpen`) ; « Déconnecter les autres appareils » reste visible liste repliée. Déconnexion = cet appareil seulement (piège 39).
- « Télécharger mes données » : `PlayersApi.exportMyData` (`GET /api/players/me/export`), JSON remis en forme, enregistré directement par `FileDownload` (`core/download/`, lien `blob:` cliqué puis retiré), nom tiré de `exportedAt`.
- « Supprimer mon compte » : un lien en dernier qui ouvre `DeleteAccountDialog` (`ModalService.open` avec l'injecteur de la page, pour `ProfileStore`) ; « Supprimer » actif seulement pour le bon pseudo (`samePseudo` : sans espaces autour ni casse, comme le back) ; `ProfileStore.deleteAccount` vide la session et la page revient à `/`. Un refus `players.pseudo_mismatch` s'affiche dans la fenêtre, sans code technique.
- Le profil n'affiche ni série ni gels ; il mène au choix du nom du classement général par un simple lien (`account` n'importe pas `social`).
- `BrowserIdComponent` copie l'identifiant du navigateur par `ClipboardService` (piège 45).

## Tests

`dom.ts` (`type`, `settle`, `query`, `text`) et `token-page.ts` dans `feature/testing/` ; faux `PlayersApi` dans `data-access/testing/fake-players-api.ts` (`providePlayersApiFake`). E2E : `login.spec.ts`, `devices.spec.ts` (deux contextes de navigateur), `account-data.spec.ts`, `profile.spec.ts`, `change-email.spec.ts`. La source d'arrivée n'a plus d'E2E : `arrival-source.service.spec.ts` (lecture du `utm_source`), `app.routes.spec.ts` (la redirection garde la query), `session-loader.spec.ts` et `players.api.spec.ts` (envoyée à la création de l'invité), `GuestTests` et `PlayerDataTests` au back (notée, exportée).
