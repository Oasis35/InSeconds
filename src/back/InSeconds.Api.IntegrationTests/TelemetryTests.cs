using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace InSeconds.Api.IntegrationTests;

// Gestionnaire d'erreurs global, remontée des erreurs front et confidentialité de la télémétrie
// (cf. Common/Observability).
[Collection("Integration")]
public class TelemetryTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Gestionnaire d'erreurs global ────────────────────────────────────────

    [Fact]
    public async Task ExceptionNonGeree_Retourne500ProblemDetailsAvecTraceId()
    {
        var resp = await _client.GetAsync("/api/e2e/throw");

        Assert.Equal(HttpStatusCode.InternalServerError, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);

        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var traceId = body.GetProperty("traceId").GetString();
        Assert.Matches("^[0-9a-f]{32}$", traceId);
        // Jamais le message ni la stack de l'exception côté client.
        Assert.DoesNotContain("Exception de test", body.ToString());
    }

    [Fact]
    public async Task ExceptionNonGeree_GardeLesEnTetesCors()
    {
        // Sans en-tête CORS, le navigateur masque la réponse : le front ne pourrait pas lire le
        // code d'erreur. Le client partagé envoie Origin: http://localhost:5173.
        var resp = await _client.GetAsync("/api/e2e/throw");

        Assert.Equal(HttpStatusCode.InternalServerError, resp.StatusCode);
        Assert.True(resp.Headers.TryGetValues("Access-Control-Allow-Origin", out var origins));
        Assert.Contains("http://localhost:5173", origins);
    }

    // ── POST /api/client-errors ──────────────────────────────────────────────

    [Fact]
    public async Task ClientError_Valide_Retourne204_SansAuth()
    {
        var freshClient = factory.CreateClient();

        var resp = await freshClient.PostAsJsonAsync("/api/client-errors", new
        {
            source = "js",
            message = "TypeError: x is undefined",
            stack = "at foo (main.js:1:1)",
            url = "https://inseconds.cc/",
        });

        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);
    }

    [Fact]
    public async Task ClientError_ErreurHttp_AvecTraceLiee_Retourne204()
    {
        var resp = await _client.PostAsJsonAsync("/api/client-errors", new
        {
            source = "http",
            message = "Http failure response: 500",
            url = "/api/sessions",
            httpStatus = 500,
            relatedTraceId = "0123456789abcdef0123456789abcdef",
        });

        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);
    }

    [Theory]
    [InlineData("autre", "message")]
    [InlineData("js", "")]
    public async Task ClientError_Invalide_Retourne400(string source, string message)
    {
        var resp = await _client.PostAsJsonAsync("/api/client-errors", new { source, message });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task ClientError_MessageTropLong_Retourne400()
    {
        var resp = await _client.PostAsJsonAsync("/api/client-errors", new
        {
            source = "js",
            message = new string('x', 1001),
        });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    // ── Confidentialité des traces ───────────────────────────────────────────

    [Fact]
    public async Task Traces_NeContiennentNiCookieNiAuthorization()
    {
        const string secret = "secret-a-ne-jamais-exporter";
        var captured = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Microsoft.AspNetCore",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => { lock (captured) captured.Add(activity); },
        };
        ActivitySource.AddActivityListener(listener);

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/settings");
        req.Headers.Add("Cookie", $"authToken={secret}");
        req.Headers.Add("Authorization", $"Bearer {secret}");
        var resp = await factory.CreateClient().SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        // L'activité de la requête est arrêtée à la fin du pipeline, parfois juste après que le
        // client a reçu la réponse : on attend (brièvement) qu'elle soit capturée.
        List<Activity> snapshot = [];
        for (var i = 0; i < 40; i++)
        {
            lock (captured) snapshot = [.. captured];
            if (snapshot.Any(a => a.GetTagItem("url.path") as string == "/api/settings"))
                break;
            await Task.Delay(50);
        }

        // L'instrumentation OpenTelemetry a bien tagué la requête…
        Assert.Contains(snapshot, a => a.GetTagItem("url.path") as string == "/api/settings");
        // …sans jamais y recopier le cookie ou l'en-tête Authorization.
        foreach (var activity in snapshot)
        {
            foreach (var tag in activity.TagObjects)
            {
                Assert.DoesNotContain("cookie", tag.Key, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("authorization", tag.Key, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain(secret, tag.Value?.ToString() ?? "");
            }
        }
    }
}
