using System.Text.Json;
using System.Text.Json.Serialization;

namespace InSeconds.Api.Infrastructure.Deezer;

public sealed class DeezerClient(HttpClient http)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<string?> GetPreviewUrlAsync(long deezerTrackId, CancellationToken ct = default)
    {
        try
        {
            var response = await http.GetFromJsonAsync<DeezerTrackResponse>(
                $"/track/{deezerTrackId}", JsonOptions, ct);
            return response?.Preview;
        }
        catch
        {
            return null;
        }
    }

    public async Task<DeezerTrackInfo?> GetTrackInfoAsync(long deezerTrackId, CancellationToken ct = default)
    {
        try
        {
            var response = await http.GetFromJsonAsync<DeezerTrackResponse>(
                $"/track/{deezerTrackId}", JsonOptions, ct);
            return response is { Title: not null, Artist.Name: not null }
                ? new DeezerTrackInfo(response.Artist.Name, response.Title, response.Preview, response.Id, ExtractCoverHash(response.Album?.CoverMedium))
                : null;
        }
        catch
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<DeezerTrackInfo>> SearchTracksAsync(string query, CancellationToken ct = default)
    {
        try
        {
            var response = await http.GetFromJsonAsync<DeezerSearchResponse>(
                $"/search?q={Uri.EscapeDataString(query)}&limit=10", JsonOptions, ct);
            return response?.Data?
                .Where(t => t.Title is not null && t.Artist?.Name is not null)
                .Select(t => new DeezerTrackInfo(t.Artist!.Name!, t.Title!, t.Preview, t.Id, ExtractCoverHash(t.Album?.CoverMedium)))
                .ToList() ?? [];
        }
        catch
        {
            return [];
        }
    }

    // Extrait le hash depuis "https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg"
    private static string? ExtractCoverHash(string? coverUrl)
    {
        if (coverUrl is null) return null;
        const string marker = "/images/cover/";
        var start = coverUrl.IndexOf(marker, StringComparison.Ordinal);
        if (start < 0) return null;
        start += marker.Length;
        var end = coverUrl.IndexOf('/', start);
        return end > start ? coverUrl[start..end] : null;
    }

    private sealed class DeezerTrackResponse
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("title")]
        public string? Title { get; set; }

        [JsonPropertyName("preview")]
        public string? Preview { get; set; }

        [JsonPropertyName("artist")]
        public DeezerArtist? Artist { get; set; }

        [JsonPropertyName("album")]
        public DeezerAlbum? Album { get; set; }
    }

    private sealed class DeezerSearchResponse
    {
        [JsonPropertyName("data")]
        public List<DeezerTrackResponse>? Data { get; set; }
    }

    private sealed class DeezerArtist
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }

    private sealed class DeezerAlbum
    {
        [JsonPropertyName("cover_medium")]
        public string? CoverMedium { get; set; }
    }
}

public sealed record DeezerTrackInfo(string Artist, string Title, string? PreviewUrl, long DeezerTrackId, string? CoverHash);
