namespace InSeconds.Api.Infrastructure.Deezer;

internal sealed class FakeDeezerHandler : HttpMessageHandler
{
    // Port configurable via E2E_FRONT_PORT (défaut 5174 local, 5173 en CI)
    private static readonly string PreviewUrl =
        $"http://localhost:{Environment.GetEnvironmentVariable("E2E_FRONT_PORT") ?? "5174"}/test-audio.mp3";

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri?.AbsolutePath ?? "";

        if (path.StartsWith("/track/", StringComparison.OrdinalIgnoreCase)
            && long.TryParse(path["/track/".Length..], out var id))
        {
            // IDs >= 9_000_000_000 : morceaux sans preview (pour tester le flux "↻ Actualiser")
            var preview = id >= 9_000_000_000L ? "" : PreviewUrl;
            var json = $$"""
                {
                  "id": {{id}},
                  "title": "E2E Track {{id}}",
                  "preview": "{{preview}}",
                  "artist": { "id": 1, "name": "E2E Artist" },
                  "album": { "id": 1, "cover_medium": null }
                }
                """;
            return Task.FromResult(JsonResponse(json));
        }

        if (path.StartsWith("/search", StringComparison.OrdinalIgnoreCase))
        {
            var query = request.RequestUri?.Query ?? "";

            // Déclencheur pour les tests d'intégration du nettoyage/dédup de l'autocomplete
            // public (SearchEndpoint.CleanAndDeduplicate) : plusieurs variantes parenthésées
            // du même morceau + un morceau distinct.
            if (query.Contains("dedup-test", StringComparison.OrdinalIgnoreCase))
            {
                var dedupJson = $$"""
                    { "data": [
                      { "id": 1, "title": "E2E Track (Remastered 2011)", "preview": "{{PreviewUrl}}",
                        "artist": { "id": 1, "name": "E2E Artist" }, "album": { "id": 1, "cover_medium": null } },
                      { "id": 2, "title": "E2E Track (Live)", "preview": "{{PreviewUrl}}",
                        "artist": { "id": 1, "name": "E2E Artist" }, "album": { "id": 1, "cover_medium": null } },
                      { "id": 3, "title": "E2E Track", "preview": "{{PreviewUrl}}",
                        "artist": { "id": 1, "name": "E2E Artist" }, "album": { "id": 1, "cover_medium": null } },
                      { "id": 4, "title": "Another Track", "preview": "{{PreviewUrl}}",
                        "artist": { "id": 2, "name": "Other Artist" }, "album": { "id": 1, "cover_medium": null } }
                    ]}
                    """;
                return Task.FromResult(JsonResponse(dedupJson));
            }

            var json = $$"""
                { "data": [
                  { "id": 1, "title": "E2E Track", "preview": "{{PreviewUrl}}",
                    "artist": { "id": 1, "name": "E2E Artist" },
                    "album": { "id": 1, "cover_medium": null } }
                ]}
                """;
            return Task.FromResult(JsonResponse(json));
        }

        return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.NotFound));
    }

    private static HttpResponseMessage JsonResponse(string json) =>
        new(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json"),
        };
}
