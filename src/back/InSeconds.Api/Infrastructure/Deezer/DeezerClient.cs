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

    private sealed class DeezerTrackResponse
    {
        [JsonPropertyName("preview")]
        public string? Preview { get; set; }
    }
}
