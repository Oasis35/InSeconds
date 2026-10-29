using System.Collections.Concurrent;
using System.Net;
using System.Text;
using InSeconds.Deezer;

namespace InSeconds.Api.Testing.Deezer;

/// <summary>
/// L'état du faux Deezer, partagé par ses requêtes : ce qu'on lui a demandé, et un comportement que le test
/// peut imposer (<see cref="Intercept"/>). Vidé par <c>POST /api/e2e/reset</c>.
/// </summary>
public sealed class FakeDeezerState
{
    private readonly ConcurrentQueue<string> _requests = new();
    private readonly ConcurrentDictionary<long, bool> _withoutPreview = new();

    /// <summary>Chemin et requête de chaque appel reçu (<c>/track/123</c>, <c>/search?q=…</c>), dans l'ordre.</summary>
    public IReadOnlyCollection<string> Requests => _requests;

    /// <summary>
    /// Répond à la place du comportement par défaut ; une réponse <c>null</c> laisse le comportement par défaut.
    /// Permet à un test de simuler un quota, une panne ou une réponse lente.
    /// </summary>
    public Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage?>>? Intercept { get; set; }

    /// <summary>Ces morceaux n'ont plus d'extrait (Deezer les connaît toujours, sans adresse d'écoute), jusqu'au prochain <see cref="Reset"/>.</summary>
    public void WithoutPreview(IEnumerable<long> deezerTrackIds)
    {
        foreach (var id in deezerTrackIds)
            _withoutPreview[id] = true;
    }

    internal bool HasNoPreview(long deezerTrackId) => _withoutPreview.ContainsKey(deezerTrackId);

    internal void Record(HttpRequestMessage request) =>
        _requests.Enqueue(request.RequestUri?.PathAndQuery ?? string.Empty);

    public void Reset()
    {
        _requests.Clear();
        _withoutPreview.Clear();
        Intercept = null;
    }
}

/// <summary>
/// Le faux Deezer de l'hôte de test (S9 : jamais dans l'image de prod) : le vrai client Deezer et son cache
/// tournent sur ce transport truqué. Conventions :
/// <list type="bullet">
/// <item><description>un morceau d'identifiant ≥ <see cref="NoPreviewFrom"/> n'a pas d'extrait, ni ceux que le test en a privés
/// (<see cref="FakeDeezerState.WithoutPreview"/>) ;</description></item>
/// <item><description>un identifiant ≥ <see cref="NotFoundFrom"/> (et en dessous) : Deezer ne le connaît pas (erreur 800 en HTTP 200) ;</description></item>
/// <item><description>un identifiant ≥ <see cref="QuotaFrom"/> (et en dessous) : quota dépassé (erreur 4 en HTTP 200, piège 16) ;</description></item>
/// <item><description>l'album d'un morceau est <see cref="AlbumIdOf"/> et ses genres (<c>/album/{id}</c>) se déduisent de son identifiant
/// (<see cref="GenresOf"/>) : aucun, Pop, Rap/Hip Hop et Dance, ou Rock ; les erreurs d'un album se simulent par <see cref="FakeDeezerState.Intercept"/> ;</description></item>
/// <item><description>la recherche répond un seul morceau, ou, pour une requête contenant <c>dedup-test</c>,
/// trois variantes parenthésées du même morceau et un morceau distinct.</description></item>
/// </list>
/// </summary>
public sealed class FakeDeezerHandler(FakeDeezerState state) : HttpMessageHandler
{
    public const long QuotaFrom = 7_000_000_000L;
    public const long NotFoundFrom = 8_000_000_000L;
    public const long NoPreviewFrom = 9_000_000_000L;

    // Port du front (E2E_FRONT_PORT) : l'extrait est le fichier audio de test servi par le front.
    private static readonly string PreviewUrl =
        $"http://localhost:{Environment.GetEnvironmentVariable("E2E_FRONT_PORT") ?? "5176"}/test-audio.mp3";

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        state.Record(request);

        if (state.Intercept is { } intercept && await intercept(request, cancellationToken) is { } custom)
            return custom;

        var path = request.RequestUri?.AbsolutePath ?? "";

        if (path.StartsWith("/track/", StringComparison.OrdinalIgnoreCase) && long.TryParse(path["/track/".Length..], out var id))
            return state.HasNoPreview(id) ? Json(TrackJson(id, preview: "")) : TrackResponse(id);

        if (path.StartsWith("/album/", StringComparison.OrdinalIgnoreCase) && long.TryParse(path["/album/".Length..], out var albumId))
            return Json(AlbumJson(albumId));

        if (path.StartsWith("/search", StringComparison.OrdinalIgnoreCase))
            return Json(request.RequestUri!.Query.Contains("dedup-test", StringComparison.OrdinalIgnoreCase) ? DedupSearch : DefaultSearch);

        return new HttpResponseMessage(HttpStatusCode.NotFound);
    }

    private static HttpResponseMessage TrackResponse(long id)
    {
        if (id >= NoPreviewFrom)
            return Json(TrackJson(id, preview: ""));
        if (id >= NotFoundFrom)
            return Json("""{"error":{"type":"DataException","message":"no data","code":800}}""");
        if (id >= QuotaFrom)
            return Json("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""");
        return Json(TrackJson(id, PreviewUrl));
    }

    /// <summary>L'album du faux morceau : dix albums se partagent les morceaux, de 1 à 10.</summary>
    public static long AlbumIdOf(long trackId) => trackId % 10 + 1;

    /// <summary>
    /// Les genres du faux album, déduits de son identifiant : un multiple de 4 n'en a aucun, 1 modulo 4 est « Pop », 2 modulo 4 est
    /// « Rap/Hip Hop » et « Dance », 3 modulo 4 est « Rock ».
    /// </summary>
    public static IReadOnlyList<(long Id, string Name)> GenresOf(long albumId) => (albumId % 4) switch
    {
        1 => [(132, "Pop")],
        2 => [(116, "Rap/Hip Hop"), (113, "Dance")],
        3 => [(152, "Rock")],
        _ => [],
    };

    private static string AlbumJson(long albumId)
    {
        if (albumId >= NotFoundFrom)
            return """{"error":{"type":"DataException","message":"no data","code":800}}""";
        if (albumId >= QuotaFrom)
            return """{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""";

        var genres = string.Join(",", GenresOf(albumId).Select(g => $$"""{ "id": {{g.Id}}, "name": "{{g.Name}}", "type": "genre" }"""));
        return $$"""{ "id": {{albumId}}, "title": "E2E Album {{albumId}}", "genres": { "data": [ {{genres}} ] } }""";
    }

    private static string TrackJson(long id, string preview) => $$"""
        {
          "id": {{id}},
          "title": "E2E Track {{id}}",
          "preview": "{{preview}}",
          "rank": {{500_000 + id % 1000}},
          "artist": { "id": 1, "name": "E2E Artist" },
          "album": { "id": {{AlbumIdOf(id)}}, "cover_medium": "https://cdn-images.dzcdn.net/images/cover/e2ecover{{id}}/250x250-000000-80-0-0.jpg" },
          "release_date": "2015-06-01"
        }
        """;

    // Plusieurs variantes parenthésées du même morceau et un morceau distinct, pour le nettoyage et la
    // déduplication de la recherche publique.
    private static readonly string DedupSearch = $$"""
        { "data": [
          { "id": 1, "title": "E2E Track (Remastered 2011)", "preview": "{{PreviewUrl}}", "rank": 400000,
            "artist": { "id": 1, "name": "E2E Artist" }, "album": { "id": 1, "cover_medium": null } },
          { "id": 2, "title": "E2E Track (Live)", "preview": "{{PreviewUrl}}", "rank": 300000,
            "artist": { "id": 1, "name": "E2E Artist" }, "album": { "id": 1, "cover_medium": null } },
          { "id": 3, "title": "E2E Track", "preview": "{{PreviewUrl}}", "rank": 200000,
            "artist": { "id": 1, "name": "E2E Artist" }, "album": { "id": 1, "cover_medium": null } },
          { "id": 4, "title": "Another Track", "preview": "{{PreviewUrl}}", "rank": 100000,
            "artist": { "id": 2, "name": "Other Artist" }, "album": { "id": 1, "cover_medium": null } }
        ]}
        """;

    private static readonly string DefaultSearch = $$"""
        { "data": [
          { "id": 1, "title": "E2E Track", "preview": "{{PreviewUrl}}", "rank": 400000,
            "artist": { "id": 1, "name": "E2E Artist" },
            "album": { "id": 1, "cover_medium": null } }
        ]}
        """;

    private static HttpResponseMessage Json(string json) =>
        new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}

public static class FakeDeezerServiceCollectionExtensions
{
    /// <summary>Remplace le transport HTTP du client Deezer par <see cref="FakeDeezerHandler"/>.</summary>
    public static IServiceCollection AddFakeDeezer(this IServiceCollection services)
    {
        services.AddSingleton<FakeDeezerState>();
        services.ReplaceDeezerHttpHandler(sp => new FakeDeezerHandler(sp.GetRequiredService<FakeDeezerState>()));
        return services;
    }
}
