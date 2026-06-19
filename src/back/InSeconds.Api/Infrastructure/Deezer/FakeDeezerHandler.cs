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
            var json = $$"""
                {
                  "id": {{id}},
                  "title": "E2E Track {{id}}",
                  "preview": "{{PreviewUrl}}",
                  "artist": { "id": 1, "name": "E2E Artist" },
                  "album": { "id": 1, "cover_medium": null }
                }
                """;
            return Task.FromResult(JsonResponse(json));
        }

        if (path.StartsWith("/search", StringComparison.OrdinalIgnoreCase))
        {
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
