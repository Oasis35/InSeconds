# RGPD : ce qui est en place

État au 28/10/2026, après la passe RGPD du 16/10/2026 (PR #351, #349, #352), la partie du mode Run (#363) et la source d'arrivée (#445). Le texte public est la page `/privacy` (traductions `privacy.*` de `public/i18n/fr.json` et `en.json`), les mentions légales (éditeur, hébergeur, Deezer) sont sur `/legal` (`legal.*`) : toute évolution du traitement des données doit y être reportée.

## Accès aux données

- **Admin réservé** : toute route `/api/admin*` reçoit la policy Admin d'office, `/jobs` aussi ; le rôle est relu en base (cache d'une minute) et posé uniquement en SQL (piège 5). `SecurityTests` vérifie le 401/403 de toutes les routes admin.
- **Minimisation dans l'admin** : aucune réponse saisie, aucun appareil, aucune IP, aucun invité nominatif ; tableau de bord en agrégats ; stories hebdomadaires sans joueur. L'onglet Joueurs masque l'email (affiché au clic). Le pseudo est joint à la lecture et disparaît avec le joueur. `/privacy` dit ce que l'éditeur voit d'un compte (pseudo, email, série, 30 derniers jours).
- **Aucun export de l'admin** : seul le joueur peut obtenir une copie de ses données.
- **API en `Cache-Control: no-store`**.

## Journaux

Jamais d'email, de pseudo, de réponse saisie, de cookie ni d'`Authorization` (testé) : la recherche Deezer ne journalise que sa longueur (piège 36), les emails que leur sujet, les erreurs du front perdent query string et fragment, l'appareil est un libellé grossier (« Safari · iPhone »). Détail : `CLAUDE.md` § Ce que fait l'application (Observabilité).

## Mesure d'audience

Cloudflare Web Analytics, en injection automatique sur le site `inseconds.cc` (réglage du tableau de bord Cloudflare, rien dans le code) : sans cookie ni identifiant, statistiques agrégées seulement (visites, pages vues, pays, référents, appareils, vitesse). Pas de bandeau de consentement. Décrit dans `/privacy` (« Données collectées », « Cookie », « Destinataires ») ; son script est dans la CSP (`static.cloudflareinsights.com` en `script-src` et `connect-src`, `nginx/csp.conf.template`), ses mesures partent vers le même domaine (`/cdn-cgi/rum`). Google Analytics a été écarté le 24/10/2026 : il imposerait un bandeau de consentement et enverrait les données chez Google.

**Source d'arrivée d'un invité** (#445) : à l'ouverture, le front lit le `utm_source` du lien, sinon le **domaine seul** du référent (jamais l'adresse complète), le garde le temps de la visite dans `sessionStorage` et l'envoie à la création de l'invité. Le serveur ne garde qu'une valeur au format strict (minuscules, lettres, chiffres, `.` `-` `_`, 40 caractères au plus, `other` sinon, `direct` sans source) dans `players.players.acquisition_source` : rattachée à l'identifiant pseudonyme, dans la copie des données, effacée avec le joueur. Le compteur Grafana (`inseconds_players_guests_created_total`) n'a que la source en étiquette, jamais le joueur. Base légale : intérêt légitime (mesure d'audience), décrite dans `/privacy` (« Données collectées »).

## Droits du joueur

- **Copie** : `GET /api/players/me/export` (JSON : source d'arrivée, compte, appareils, puis une section par mode de jeu sous `modules` : `modules.daily` pour la série et les parties, `modules.runs` pour les parties, les playlists créées, le record et l'accès), bouton « Tes données » du profil.
- **Effacement** : `POST /api/players/me/delete` (pseudo retapé pour confirmer), effacement réel (`AccountErasure`, qui appelle l'`IPlayerDataContributor` de chaque mode de jeu dans la même transaction).
- **Sans connexion possible** : commandes de secours sur le VPS `--export-player` / `--delete-player` (cf. `src/back/CLAUDE.md` § Démarrage), réponse sous un mois, uniquement à l'adresse du compte.

## Mode Run (Platines)

- **Données gardées** (schéma `runs`) : les parties (statut, manches passées, score, dates), le résultat de chaque morceau (artiste et titre trouvés ou non, points, morceau neutralisé), **jamais le texte saisi** ; le record (meilleur score, meilleur disque) ; les playlists lancées et leur auteur ; l'accès accordé par l'admin.
- **Visibilité** : une playlist se partage par son lien (code de 6 caractères). Qui l'ouvre voit le pseudo de son auteur (rien pour un invité ou un compte effacé : « Invité » à l'écran) ; la comparaison, à venir (#366), montrera après sa propre partie le pseudo, le disque et le score de chaque joueur de la playlist. Pas de classement public, pas de nombre de joueurs sur le lien. La page `/privacy` le dit (§ Données collectées).
- **Effacement** : `RunsPlayerData` supprime les parties, les réponses, le record et l'accès du joueur ; les playlists qu'il a lancées restent jouables, `created_by` passe à `null`.
- **Énumération des liens** : la lecture d'un lien est limitée à 60 requêtes par IP en 5 minutes (`run-link`), pour 31⁶ codes possibles.

## Durées de conservation

Appliquées chaque nuit par `players-purge-expired-tokens` :

| Donnée | Durée |
|---|---|
| Jetons de connexion et de changement d'email | jusqu'à expiration |
| Appareil (même déconnecté) | 91 jours après sa dernière visite (un jour après l'expiration du cookie) |
| Compte sans visite | 3 ans, puis effacé avec son historique (jamais un admin, sans email de prévenance) |
| Invité | jamais effacé, mais anonyme une fois ses appareils supprimés |
| Playlist d'un run | sans limite, comme les défis du jour ; sans auteur une fois son compte effacé |
| Texte tapé par le joueur | jamais stocké (seule la correction est gardée) |

## Staging

Copie de la prod anonymisée (`deploy/vps/staging-anonymize.sql`) : emails et pseudos remplacés, rôle admin retiré sauf `STAGING_KEEP_EMAIL`, emails sortants redirigés (cf. [`exploitation/deploiement.md`](../exploitation/deploiement.md#staging-devinsecondscc--api-devinsecondscc)).

Le texte saisi déjà stocké a été supprimé par migration ; `VACUUM FULL daily.answers` a récupéré sa place en prod le 19/10/2026.

## Reste ouvert

- **Pas de trace des actions de l'admin** (qui a consulté ou modifié quoi). Un seul admin aujourd'hui : à reconsidérer s'il y en a un deuxième.
