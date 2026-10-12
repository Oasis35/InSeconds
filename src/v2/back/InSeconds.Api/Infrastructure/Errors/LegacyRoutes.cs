namespace InSeconds.Api.Infrastructure.Errors;

/// <summary>
/// Les routes de la v1, retirées à la bascule. Un onglet resté ouvert sur l'ancien front les appelle encore :
/// elles répondent <c>410 Gone</c> avec le code <see cref="ErrorCodes.NewVersion"/>, que l'ancien front affiche
/// comme une erreur avec rechargement et que le nouveau front traduit en « recharge la page » (§ 10.2 du plan v2).
/// À supprimer quelques semaines après la bascule (I1).
/// </summary>
public static class LegacyRoutes
{
    public const string Title = "This version of the app is outdated, reload the page.";

    /// <summary>
    /// Modèles de route de la v1 absents de la v2. Les routes qui existent aux deux endroits
    /// (<c>/api/players/me</c>, <c>/api/players/me/pseudo</c>, <c>/api/admin/me</c>, <c>/api/admin/players</c>,
    /// <c>/api/client-errors</c>) n'y figurent pas : la v2 les sert. Une route connue de la v2 l'emporte toujours
    /// sur un modèle ici (les segments fixes ont priorité sur un « catch-all »).
    /// </summary>
    public static readonly string[] Patterns =
    [
        "/api/sessions",
        "/api/sessions/{**rest}",
        "/api/stats/{**rest}",
        "/api/settings",
        "/api/deezer/{**rest}",
        "/api/auth/{**rest}",
        "/api/players/me/email",
        "/api/admin/stats",
        "/api/admin/challenge-stats",
        "/api/admin/challenges",
        "/api/admin/generate-today",
        "/api/admin/refresh-previews",
        "/api/admin/weekly-recap",
        "/api/admin/deezer-search",
        "/api/admin/settings/{**rest}",
        "/api/admin/tracks",
        "/api/admin/tracks/{**rest}",
        "/api/admin/players/{playerId}/history",
    ];

    private static readonly string[] Methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

    public static WebApplication MapLegacyRoutes(this WebApplication app)
    {
        foreach (var pattern in Patterns)
        {
            app.MapMethods(pattern, Methods, () => Results.Problem(
                    statusCode: StatusCodes.Status410Gone,
                    title: Title,
                    extensions: new Dictionary<string, object?> { ["code"] = ErrorCodes.NewVersion }))
                .AllowAnonymous()
                .ExcludeFromDescription();
        }

        return app;
    }
}
