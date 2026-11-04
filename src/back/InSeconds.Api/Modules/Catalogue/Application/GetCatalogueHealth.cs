using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Ce que le panneau technique de l'admin montre du pool.</summary>
/// <param name="MissingPreviewCount">Morceaux actifs dont Deezer n'a plus d'extrait (jamais tirés : à remplacer ou désactiver).</param>
/// <param name="MissingWaveformCount">
/// Morceaux actifs avec un extrait mais sans forme d'onde : le lecteur la calcule alors dans le navigateur, et le prochain passage
/// (<c>catalogue-refresh</c>, ou 15 min après un ajout) la rattrape (piège 50).
/// </param>
public sealed record CatalogueHealthResponse(int MissingPreviewCount, int MissingWaveformCount);

public static class GetCatalogueHealthEndpoint
{
    /// <summary><c>GET /api/admin/catalogue/health</c> : les morceaux sans extrait et ceux sans forme d'onde, lus en base.</summary>
    [WolverineGet("/api/admin/catalogue/health", OperationId = "getCatalogueHealth")]
    public static Task<CatalogueHealthResponse> Get(ICatalogueQueries queries, CancellationToken ct) => queries.GetHealthAsync(ct);
}
