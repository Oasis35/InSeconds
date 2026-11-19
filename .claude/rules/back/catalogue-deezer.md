---
paths:
  - "src/back/InSeconds.Api/Modules/Catalogue/**"
  - "src/back/InSeconds.Deezer/**"
  - "src/back/InSeconds.Waveform/**"
  - "src/back/tests/**/Catalogue/**"
  - "src/back/tests/**/Deezer/**"
  - "src/back/tests/**/Waveform/**"
---
# Module Catalogue, client Deezer, formes d'onde

Conditions de l'API Deezer : piège 47 (seules des métadonnées sont gardées, jamais d'audio ni d'image). Piège 16 (erreurs en HTTP 200) et piège 14 (extraits signés 15 min) gouvernent tout ce qui suit.

## Client Deezer (`InSeconds.Deezer`)

- Ne connaît ni l'API, ni `InSeconds.Infrastructure`, ni aucun module (`ProjectDependencyTests`). Un seul `DeezerClient` (`HttpClient` typé) implémente **cinq ports** (`Ports.cs`) : `IPreviewProvider` (extrait du jeu), `ITrackMetadataSource` (artiste, titre, pochette, année, rang, album, extrait), `IAlbumSource` (genres d'un album : le morceau n'en porte pas chez Deezer), `IPreviewAudioSource` (MP3 d'un extrait pour la forme d'onde), `ITrackSearch`.
- **Jamais de `null` ambigu** : chaque résultat distingue trouvé, absent déterminé (seul le code **800** de Deezer) et `Unavailable` (quota, panne, tout autre code, toute erreur HTTP ou de lecture, et un album rendu sans champ `genres`). Seuls les deux premiers permettent de conclure.
- Annulation (piège 13) : `OperationCanceledException` relancée seulement si elle vient du `ct` de l'appelant ; le délai interne du `HttpClient` est un `Unavailable` journalisé. Jamais le texte d'une recherche dans un journal, seulement sa longueur (piège 36) ; jamais une URL signée.
- `GetTrackAsync` rend l'**identifiant demandé**, pas le champ `id` de la réponse (le pool a vérifié les doublons sur lui). Année `null` si inférieure à 1 (« 0000-00-00 »). Artiste ou titre vide : introuvable (422 à l'ajout, jamais une exception de domaine).
- `IPreviewAudioSource` n'accepte que l'hôte `Deezer:PreviewHostSuffix` (`.dzcdn.net`, `localhost` dans les tests), redirection comprise, 3 Mo au plus, en mémoire seulement.
- **Pas de cache des extraits** (piège 14) : `IPreviewProvider` est le client brut. Seule la recherche publique passe par `CachedTrackSearch` (1 h, jamais un échec ni une liste vide), dans `DeezerCache` (cache dédié, `Size = 1` sur chaque `Set`, piège 24).
- Les ports sont des fabriques : chacun est déclaré un par un à `AlwaysUseServiceLocationFor` dans `WolverineSetup`. Un port de plus s'y ajoute.
- Résilience (`Deezer:ResilienceEnabled`, coupée dans l'hôte de test et `ApiFactory`) : condition par configuration, jamais sur l'environnement.

## Domaine et ports du Catalogue

- `Track` : `RecordPreviewCheck` **ne change rien sur `Unavailable`** (pas même la date du contrôle) ; un autre album remet les genres à lire (`RecordAlbum`) ; `SetManualGenre` crée au besoin un genre à identifiant négatif (ceux de Deezer gardent l'identifiant de Deezer), relu par le contrôle nocturne au plus tous les 30 jours (`GenresNeedReading`) ; `SetAltTitles` (titres alternatifs acceptés comme bonne réponse, jamais montrés).
- `Candidate` (sas « À valider ») : **jamais tirable ni compté dans le pool**, supprimé à son ajout au pool. Identifiant HiLo tiré dès l'ajout (les messages de lecture le portent). Store à part : `ICandidateStore`.
- `Theme` : nom unique sans la casse ; supprimer un thème qui a encore un morceau est refusé (`RESTRICT`, 409 `catalogue.theme_in_use`). Un thème n'est jamais un genre.
- Ports : `ICatalogueStore` (morceaux, genres, thèmes), `ICandidateStore`, `ICatalogueQueries` (`Application/CatalogueSupport.cs`). La création d'un morceau neuf (genres de l'album, forme d'onde différée) est écrite une seule fois dans `TrackMapping` (`NewTrack`, `EnsureAlbumGenresAsync`, `ScheduleWaveform`), pour l'ajout à la main et l'ajout d'un candidat.
- Renommer un morceau est permis à tout moment, défi du jour compris, sans verrou : les modes relisent le nom à chaque réponse.
- Rien n'est supprimé en cascade : un morceau qui a servi ne se supprime pas (409 `catalogue.track_in_use`), la clé étrangère `RESTRICT` est déclarée côté mode.

## Contrats (`Contracts/`)

- `ITrackDirectory` (morceaux pour Daily et Runs : nom brut, titre affiché nettoyé par `TrackTitles.CleanDisplayTitle`, pochette reconstruite, genres, thèmes, titres alternatifs ; `ListPlayableIdsAsync` : non désactivés et extrait **disponible**, triés par identifiant).
- `ITrackPreviews` : extrait demandé à Deezer à chaque appel ; `GetAsync` distingue absent et indisponible (pour la neutralisation de Runs).
- `ITrackUsage` : **chaque mode ajoute le sien** (`AddScoped<ITrackUsage, …>`, jamais `Replace`) ; Catalogue les réunit dans `ITrackPoolUsage` (en service location : ajouter un mode ne régénère pas le code de Catalogue). Un morceau est utilisé dès qu'un mode le dit. Le cooldown est une règle du Daily (`IDailyTrackUsage`), absente de ce contrat.
- `ITrackWaveforms` : la forme courante des morceaux d'une partie ; un morceau sans forme déclenche le Warning 1203.

## Tâche `catalogue-refresh` (`RefreshPreviews`)

- Jamais en staging (même IP, même quota, piège 16). Contrôle tout le pool jouable par lots (`Catalogue:Refresh:BatchSize` / `BatchDelay`, relus à chaque contrôle), puis un appel `/album/{id}` **par album** dont les genres ne sont pas lus, puis les formes d'onde manquantes.
- Handler **`[NonTransactional]`** : le contrôle dure plusieurs minutes, une transaction ouverte pendant les pauses tiendrait une connexion et tout perdrait sur un morceau supprimé entre-temps. Morceaux lus **détachés**, chaque lot enregistré par `SaveRefreshedAsync` (`ExecuteUpdate` par morceau : un morceau supprimé est ignoré). N'écrit que l'extrait, le rang, l'album et l'état des genres : un renommage ou une désactivation faits pendant le contrôle ne sont jamais écrasés. Les genres d'un album passent par `SaveAlbumGenresAsync` (exception écrite à la règle du `SaveChanges`).
- Un morceau qui change d'album perd tout de suite les genres de l'ancien (lignes de `track_genres` supprimées par `SaveRefreshedAsync`, car les morceaux sont lus sans leurs genres). Un morceau désactivé n'est pas contrôlé.
- `[DisableConcurrentExecution(600)]` : la tâche de la nuit attend un contrôle lancé depuis `/jobs` au lieu d'échouer. Compte rendu en dictionnaire.

## Candidats

- Import puis lecture chez Deezer **en arrière-plan** : messages `ReadCandidates`, puis ajout au pool par `AddCandidatesToCatalogue`, par lots espacés comme le contrôle (`CandidateBatches.Schedule`), sur des files locales `Sequential` (`WolverineSetup`) : jamais deux lots à la fois (quota Deezer, et deux ajouts qui créeraient le même genre neuf). `Unavailable` laisse le candidat à lire.
- Deux ajouts simultanés qui écrivent le même genre neuf : le second est refusé sur la clé du genre, 409 `catalogue.concurrent_add` (la transaction Wolverine étant annulée, pas de nouvel essai possible dans le handler). Même code quand deux imports insèrent le même candidat.
- L'extrait d'un candidat se demande frais à chaque écoute (15 min, piège 14) ; aucune pochette Deezer n'est affichée dans le sas.

## Forme d'onde (piège 50)

- `InSeconds.Waveform` (NLayer, ne connaît rien d'autre) décode un MP3 MPEG-1 44,1 kHz en blob versionné (`WaveformFormat`, octet de version en tête). Changer le format = changer la version : les anciennes formes sont recalculées.
- `WaveformCalculator` (télécharge, décode, enregistre par `SaveWaveformAsync`, trois colonnes) est appelé par l'étape de `RefreshPreviews` et par le message `ComputeWaveforms` (différé de `Catalogue:Waveform:DelayMinutes` après un ajout, glissant, `[NonTransactional]`), **sous un seul verrou** : `IWaveformLock` (`PostgresWaveformLock`, verrou consultatif 474 sur une connexion à part). Le message se replanifie si le verrou est pris.
- `Track.NeedsWaveform` : forme absente, d'une autre version, ou extrait au nom de fichier différent de `waveform_source` (le nom est le md5 du contenu).
- Télémétrie : `CatalogueTelemetry` (compteurs, durée, jauge des formes manquantes, source de traces `InSeconds.Catalogue`) lue par le tableau Grafana Exploitation.
