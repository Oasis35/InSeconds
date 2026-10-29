using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace InSeconds.Deezer;

/// <summary>
/// Client HTTP de l'API Deezer, qui implémente les quatre ports. C'est l'état réel chez Deezer : le cache
/// des recherches publiques (<see cref="CachedTrackSearch"/>) est un décorateur, utilisé là où l'état exact
/// n'est pas nécessaire. Les extraits n'ont pas de cache : leurs adresses sont signées pour 15 min (piège 14). Le <see cref="HttpClient"/> arrive configuré (adresse de base,
/// résilience), cf. <see cref="DeezerServiceCollectionExtensions"/>.
/// </summary>
/// <remarks>
/// Deezer renvoie ses erreurs (quota, service occupé, morceau supprimé) en HTTP 200 avec un payload
/// <c>{"error":{"code":…}}</c> : il contourne la résilience HTTP et se désérialiserait en champs vides
/// (piège 16). Le code 800 (« no data ») est une réponse déterminée, tout autre code (4 quota, 700 occupé,
/// ou un code futur) est « indisponible ».
/// </remarks>
public sealed class DeezerClient(HttpClient http, ILogger<DeezerClient> logger) : IPreviewProvider, ITrackSearch, ITrackMetadataSource, IAlbumSource
{
    private const int NoDataErrorCode = 800;

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public async Task<PreviewLookup> GetPreviewAsync(long deezerTrackId, CancellationToken ct = default)
    {
        var fetched = await FetchTrackAsync(deezerTrackId, ct);
        if (fetched.Outcome == FetchOutcome.Unavailable)
            return new PreviewLookup.Unavailable();

        if (!string.IsNullOrEmpty(fetched.Track?.Preview))
            return new PreviewLookup.Found(fetched.Track.Preview);

        if (fetched.Outcome == FetchOutcome.Ok)
            DeezerLog.NoPreview(logger, deezerTrackId);
        return new PreviewLookup.Missing();
    }

    public async Task<TrackMetadataLookup> GetTrackAsync(long deezerTrackId, CancellationToken ct = default)
    {
        var fetched = await FetchTrackAsync(deezerTrackId, ct);
        if (fetched.Outcome == FetchOutcome.Unavailable)
            return new TrackMetadataLookup.Unavailable();

        // L'identifiant est celui demandé, pas le champ « id » de la réponse : c'est sur lui que le pool vérifie
        // les doublons, et une réponse sans « id » donnerait 0.
        return fetched.Track is { } track && ToDeezerTrack(track) is { } found
            ? new TrackMetadataLookup.Found(found with { DeezerTrackId = deezerTrackId })
            : new TrackMetadataLookup.NotFound();
    }

    public async Task<AlbumLookup> GetAlbumAsync(long albumId, CancellationToken ct = default)
    {
        try
        {
            var response = await http.GetFromJsonAsync<DeezerAlbumResponse>($"/album/{albumId}", JsonOptions, ct);

            if (response?.Error is { } error)
            {
                DeezerLog.AlbumError(logger, albumId, error.Code, error.Message);
                return error.Code == NoDataErrorCode ? new AlbumLookup.NotFound() : new AlbumLookup.Unavailable();
            }

            // Une réponse sans champ « genres » (corps vide, réponse tronquée) ne dit rien de l'album : indisponible, il sera
            // redemandé. Seule une liste présente, même vide, permet de conclure (et de ne plus le redemander).
            if (response?.Genres is not { } genres)
            {
                DeezerLog.AlbumWithoutGenres(logger, albumId);
                return new AlbumLookup.Unavailable();
            }

            // Un genre sans nom ne dirait rien à l'admin : écarté.
            return new AlbumLookup.Found(genres.Data?
                .Where(g => g.Id > 0 && !string.IsNullOrWhiteSpace(g.Name))
                .Select(g => new DeezerGenre(g.Id, g.Name!.Trim()))
                .ToList() ?? []);
        }
        // Seule l'annulation demandée par l'appelant est relancée : le délai d'attente interne d'un HttpClient lève aussi
        // une OperationCanceledException, qui est un échec de Deezer comme un autre.
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            DeezerLog.AlbumRequestFailed(logger, ex, albumId);
            return new AlbumLookup.Unavailable();
        }
    }

    public async Task<SearchLookup> SearchAsync(string query, int limit, CancellationToken ct = default)
    {
        try
        {
            var response = await http.GetFromJsonAsync<DeezerSearchResponse>(
                $"/search?q={Uri.EscapeDataString(query)}&limit={limit}", JsonOptions, ct);

            if (response?.Error is { } error)
            {
                DeezerLog.SearchError(logger, query.Length, error.Code, error.Message);
                return new SearchLookup.Unavailable();
            }

            // Un résultat sans identifiant ne pourrait pas être ajouté au pool : écarté.
            return new SearchLookup.Found(response?.Data?
                .Where(t => t.Id > 0)
                .Select(ToDeezerTrack)
                .OfType<DeezerTrack>()
                .ToList() ?? []);
        }
        // Seule l'annulation demandée par l'appelant est relancée : le délai d'attente interne d'un HttpClient lève aussi
        // une OperationCanceledException, qui est un échec de Deezer comme un autre.
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            DeezerLog.SearchRequestFailed(logger, ex, query.Length);
            return new SearchLookup.Unavailable();
        }
    }

    private async Task<TrackFetch> FetchTrackAsync(long deezerTrackId, CancellationToken ct)
    {
        try
        {
            var response = await http.GetFromJsonAsync<DeezerTrackResponse>($"/track/{deezerTrackId}", JsonOptions, ct);

            if (response?.Error is { } error)
            {
                DeezerLog.TrackError(logger, deezerTrackId, error.Code, error.Message);
                return error.Code == NoDataErrorCode
                    ? new TrackFetch(FetchOutcome.NoData, null)
                    : new TrackFetch(FetchOutcome.Unavailable, null);
            }

            return new TrackFetch(FetchOutcome.Ok, response);
        }
        // Seule l'annulation demandée par l'appelant est relancée : le délai d'attente interne d'un HttpClient lève aussi
        // une OperationCanceledException, qui est un échec de Deezer comme un autre.
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            DeezerLog.TrackRequestFailed(logger, ex, deezerTrackId);
            return new TrackFetch(FetchOutcome.Unavailable, null);
        }
    }

    /// <summary>Un morceau sans titre ou sans artiste (ou aux noms blancs) est inexploitable : comme s'il n'existait pas.</summary>
    private static DeezerTrack? ToDeezerTrack(DeezerTrackResponse track) =>
        track is { Title: { } title, Artist.Name: { } artist } && !string.IsNullOrWhiteSpace(title) && !string.IsNullOrWhiteSpace(artist)
            ? new DeezerTrack(track.Id, track.Artist.Name, track.Title, track.Preview, ExtractCoverHash(track.Album?.CoverMedium), ExtractReleaseYear(track.ReleaseDate), track.Rank, track.Album is { Id: > 0 } album ? album.Id : null)
            : null;

    // Année du champ Deezer « release_date » (« yyyy-MM-dd »), vide s'il est absent ou d'un autre format.
    private static int? ExtractReleaseYear(string? releaseDate)
    {
        if (string.IsNullOrEmpty(releaseDate))
            return null;

        var yearPart = releaseDate.Length >= 4 ? releaseDate[..4] : releaseDate;
        // Deezer met « 0000-00-00 » quand la date est inconnue : une année avant 1 n'en est pas une.
        return int.TryParse(yearPart, out var year) && year >= 1 ? year : null;
    }

    // Extrait le hash de « https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg ».
    private static string? ExtractCoverHash(string? coverUrl)
    {
        if (coverUrl is null)
            return null;

        const string marker = "/images/cover/";
        var start = coverUrl.IndexOf(marker, StringComparison.Ordinal);
        if (start < 0)
            return null;

        start += marker.Length;
        var end = coverUrl.IndexOf('/', start);
        return end > start ? coverUrl[start..end] : null;
    }

    private enum FetchOutcome
    {
        Ok,
        NoData,
        Unavailable,
    }

    private sealed record TrackFetch(FetchOutcome Outcome, DeezerTrackResponse? Track);

    private sealed class DeezerTrackResponse
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("title")]
        public string? Title { get; set; }

        [JsonPropertyName("preview")]
        public string? Preview { get; set; }

        [JsonPropertyName("rank")]
        public int? Rank { get; set; }

        [JsonPropertyName("artist")]
        public DeezerArtist? Artist { get; set; }

        [JsonPropertyName("album")]
        public DeezerAlbum? Album { get; set; }

        [JsonPropertyName("release_date")]
        public string? ReleaseDate { get; set; }

        [JsonPropertyName("error")]
        public DeezerError? Error { get; set; }
    }

    private sealed class DeezerSearchResponse
    {
        [JsonPropertyName("data")]
        public List<DeezerTrackResponse>? Data { get; set; }

        [JsonPropertyName("error")]
        public DeezerError? Error { get; set; }
    }

    private sealed class DeezerError
    {
        [JsonPropertyName("code")]
        public int Code { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    private sealed class DeezerArtist
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }

    private sealed class DeezerAlbumResponse
    {
        [JsonPropertyName("genres")]
        public DeezerGenres? Genres { get; set; }

        [JsonPropertyName("error")]
        public DeezerError? Error { get; set; }
    }

    private sealed class DeezerGenres
    {
        [JsonPropertyName("data")]
        public List<DeezerGenreResponse>? Data { get; set; }
    }

    private sealed class DeezerGenreResponse
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }

    private sealed class DeezerAlbum
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("cover_medium")]
        public string? CoverMedium { get; set; }
    }
}
