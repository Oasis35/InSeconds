---
paths:
  - "src/back/InSeconds.Api/Modules/Players/**"
  - "src/back/InSeconds.Api/Infrastructure/Auth/**"
  - "src/back/tests/**/Players/**"
---
# Module Players et authentification

Identité, compte, appareils, rôle admin, droits RGPD. Point d'entrée `PlayersModule.AddPlayers()`. L'authentification du joueur vit dans `Modules/Players/Auth/` ; les autres modules n'en voient que `ICurrentPlayer`. Restent dans `Infrastructure/Auth/` : `DataProtectionSetup` et les noms `AuthorizationPolicies.Admin` / `Roles.Admin`, que la composition applique sans connaître Players.

## Ports et contrats

- `IPlayerStore` (`Domain/`, écritures, verrous), `IPlayerQueries` (`Application/GetMe.cs`, lectures), `IPlayerSessions` (`Contracts/`, pour l'authentification : état d'un appareil, dernière visite, reprise d'un ancien cookie ; ces écritures-là s'enregistrent elles-mêmes, hors handler).
- Contrats offerts : `ICurrentPlayer`, `IPlayerDirectory` (ce que les modes savent d'un joueur), `PseudoRules` (une seule définition des caractères d'un pseudo, reprise par les noms de groupe), `IPlayerDataContributor` (implémenté par chaque mode), `IReservedPseudos` (défini par Players, implémenté par Social : un pseudo égal à l'alias d'un autre joueur est refusé, à l'inscription comme au changement).
- `IReservedNames` (`Contracts/`, implémenté par `ReservedNames` dans `Application/`) : les noms qui prêtent à confusion (« Admin », « InSeconds », une plateforme musicale…), refusés pour un pseudo (inscription par lien magique, profil, invité : 400 `players.pseudo_reserved`) et pour un nom de groupe (création et renommage par le créateur : 400 `social.reserved_name`). Jamais pour l'admin, qui nomme librement. Règle pure `Domain/ReservedNamePolicy` : trois listes (« contient » dans le nom collé, « mot » du nom, « égal » au nom entier chiffres de fin compris), nom ramené à des mots sans casse ni accents (ponctuation, espaces et majuscule après minuscule séparent), lettres répétées réduites, chiffres et lettres cyrilliques jumelles lus comme des lettres (« 1nSeconds »). Listes de départ dans `ReservedNameDefaults`, remplaçables par les réglages `Players:ReservedContains` / `ReservedWords` / `ReservedExact` (`PlayersOptions`, relus à chaud). Le terme qui a déclenché le refus n'est ni cité au joueur ni journalisé. Les noms déjà pris avant la règle ne sont pas touchés. Tests : `ReservedNamePolicyTests`, `ProfileTests`, `GuestPseudoTests`, `MagicLinkTests`, `SocialGroupTests`.
- `IPlayerDirectory.GetDisplayNamesAsync` (pseudo du compte, sinon pseudo d'invité : Runs) n'est pas `GetPseudosAsync` (comptes seulement : Daily, Social).
- Seule exception nommée au sens noyau → mode : `Daily.Contracts.IStreakGrants` (gel offert à la création d'un compte, `ModuleRules.NamedExceptions`). Il prend un verrou qui exige une transaction ; il est en service location car les tests le remplacent (`RecordingStreakGrants`).

## Cookie et validation

- Cookie : pièges 7 et 23 (`AuthSetup`), 90 jours glissants, 401/403 sans redirection (`PlayerCookieEvents`). Ticket (`PlayerClaims`) : `player_id` et `device_session_id` seulement, **jamais le rôle admin**.
- Chaque requête : `DeviceSessionValidator` vérifie l'appareil et relit le rôle admin en base ; résultat gardé une minute dans `DeviceSessionStatusCache` (cache dédié, piège 24), dernière visite notée au plus toutes les 5 minutes. Erreur de base : 500, jamais une déconnexion (piège 37).
- Révocation : `IDeviceSessionValidationCache.Forget` retire la session tout de suite **puis une seconde fois au démarrage de la réponse** (après le commit de Wolverine), et le cache compte les oublis (`Generation`, `TrySet`) : une requête concurrente qui a lu la session encore active ne peut pas la remettre en cache. Tests : `UnitTests/Players/DeviceSessionValidatorTests`.
- `device_sessions.id` en HiLo : l'identifiant part dans le cookie avant que Wolverine n'enregistre.
- Origine de confiance (`TrustedOrigins`, piège 22) : seulement sur la vérification du lien magique ; `Referer` comparé par autorité exacte, jamais par préfixe.
- Reprise des anciens cookies (`LegacyCookieTransitionMiddleware`, juste après l'authentification, à retirer avec `legacy_tokens`) : jeton haché (`LegacyToken.HashOf`, même calcul qu'en SQL) cherché dans `legacy_tokens` (S6) ; une session d'appareil par conversion ; `LegacyConversionCache` fait qu'un même jeton converti depuis moins d'une minute retrouve sa session (les requêtes parallèles du premier chargement n'en ouvrent qu'une). Un cookie standard valide l'emporte.
- `PlayerTelemetryMiddleware` (`UsePlayerTelemetry`, après la reprise des anciens cookies) : tag `inseconds.player_id` sur la trace et scope `PlayerId` ; l'identifiant technique seul.
- Data Protection (`DataProtectionSetup`, S16, piège 17) : certificat exigé quand l'API démarre en prod ou staging (pas pour `codegen write`) ; en clair en développement et en test.

## Connexion par lien magique

- `POST …/magic-link` répond toujours 204 (pas d'énumération) et publie `SendMagicLinkEmail(email)` : **le message ne porte que l'adresse** (S1), son handler génère le jeton (`AuthTokenSecret`), enregistre son hash et envoie l'email dans la transaction du message ; un envoi en échec n'enregistre rien. Un lien par minute au plus.
- Vérification (`VerifyMagicLink.cs`) : `Before` (origine), `LoadAsync` lit le jeton en `FOR UPDATE` (usage unique : une seconde confirmation simultanée attend puis échoue), `Validate`, `Post`. Le jeton n'est consommé qu'à la connexion effective (pas à l'étape du pseudo ni sur un pseudo pris). Ne jamais consommer à l'ouverture de la page (piège 21).
- `AccountSignIn` (partagé avec le dev-login) : `PrepareAsync` décide sans écrire, `ExecuteAsync` écrit dans la transaction de l'appelant. Sans compte : création sur l'invité du navigateur, **jamais en convertissant un compte déjà lié** (piège 30), puis gel offert. Toujours une session neuve et l'ancienne révoquée (S5). Vide `guest_pseudo`.
- Pseudo ou email pris au même instant : l'index unique refuse, `AccountConflictExceptionHandler` rend 409 `players.pseudo_taken` / `players.email_taken`, transaction annulée.
- Changement d'email : lien envoyé à la nouvelle adresse seulement, jeton de purpose `EmailChange` (S2), aucun cookie posé (pas de contrôle d'origine). Limité par joueur (S11).
- Pseudo : 3 à 20 caractères (`VerifyMagicLinkValidator.PseudoPattern`), CHECK `ck_accounts_pseudo_length` aligné ; unicité sans casse (`citext`). Le pseudo d'invité (`guest_pseudo`, mode Run) n'a pas d'unicité entre invités mais ne peut pas être celui d'un compte.
- Gabarits d'email (`Email/Templates`) : couleurs alignées sur la DA du jeu, à changer avec elle ; adresse encodée en HTML.

## Droits RGPD (piège 48)

- `PlayerDataExporter` : `IPlayerQueries.ExportAsync` plus une section par `IPlayerDataContributor` (`daily`, `runs`, `social`, enregistrés par `ApiComposition.AddPlayerDataContributors`) ; deux contributeurs du même nom font échouer l'export. Le nom de section fait partie du format téléchargé : jamais renommé.
- `AccountErasure` (route, purge des comptes inactifs, `--delete-player`), dans la transaction de l'appelant : données de jeu (`DeleteAsync` de chaque contributeur), puis `IPlayerStore.EraseAsync` (jetons du joueur et ceux émis pour son adresse, ancien jeton, appareils, compte, ligne `players`), puis `Forget` de chaque appareil. Journal 1008 sans email ni pseudo.
- `PlayerDataExporter` et `AccountErasure` sont en service location (ils énumèrent les contributeurs).
- Tests garde-fous : `PlayerDataTests` (effacement) et `PlayerDataExportCoverageTests` (export : chaque table avec `player_id`, et chaque autre clé vers `players.players`, est exportée ou exclue avec sa raison) lisent le schéma dans `information_schema`.

## Purge nocturne

`PlayersPurgeJob` (`players-purge-expired-tokens`, identifiant gardé pour healthchecks.io) : quatre étapes, chacune par `bus.InvokeAsync` donc dans sa propre transaction, une étape en échec n'arrêtant pas les suivantes (`players.purge_failed` à la fin, EventId 1009 par étape) : jetons expirés, appareils sans visite depuis 91 jours (`PlayerRetention.StaleDevice`), pseudos d'invité de même âge, comptes inactifs depuis 3 ans (jamais un admin ; `EraseInactiveAccount` revérifie l'inactivité). Compte rendu `{ tokens, devices, guestPseudos, accounts }`. Les durées sont annoncées par `/privacy` : les changer change ce texte.

## Divers

- `DeviceLabel` (`InSeconds.Infrastructure/Http`) : « Chrome · Android » tiré du `User-Agent` ; ni l'en-tête brut ni l'IP ne sont stockés.
- Source d'arrivée (`AcquisitionSource`) : nettoyée, jamais une erreur (`other` sinon, `direct` sans source), notée à la création de l'invité seulement.
- Classe d'appareil (`DeviceClass.From(User-Agent)` : `phone`, `tablet`, `desktop`, `null` sinon) : notée à la création de l'invité seulement, dans `players.players.device_class`, dans l'export ; jamais l'en-tête brut. Lue par `IPlayerDirectory.ListArrivalsAsync` (jour, source, classe) pour l'onglet Stats.
- `GET /api/players/me` ne crée jamais de joueur (204 sans identité) ; seul `POST /api/players/guest` en crée un (S11).
- Modération : `Application/AdminPseudo.cs` remet à zéro le pseudo d'un compte (« Joueur » et un nombre libre) ou retire celui d'un invité ; ses routes `api/admin/accounts` sont dans le document OpenAPI de Players.
