using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Testing.Deezer;
using InSeconds.Api.Testing.Email;
using InSeconds.Deezer;

namespace InSeconds.Api.Testing.E2E;

/// <summary>
/// Routes réservées aux tests (E2E Playwright), servies uniquement par l'hôte de test : l'API de prod
/// ne les connaît pas (S9). À compléter au fil des modules (seed, connexion admin, défi du jour…).
/// </summary>
public static class E2EEndpoints
{
    public const string Prefix = "/api/e2e";

    public static IServiceCollection AddE2E(this IServiceCollection services) =>
        services.AddSingleton<DatabaseResetter>();

    public static IEndpointRouteBuilder MapE2EEndpoints(this IEndpointRouteBuilder routes)
    {
        var e2e = routes.MapGroup(Prefix).ExcludeFromDescription();

        // Vide les tables des modules, les emails capturés, et remet le faux Deezer et son cache à zéro.
        e2e.MapPost("/reset", async (
            DatabaseResetter resetter, CapturingEmailSender emails, FakeDeezerState deezer, DeezerCache deezerCache, CancellationToken ct) =>
        {
            var schemas = await resetter.ResetAsync(ct);
            emails.Clear();
            deezer.Reset();
            deezerCache.Clear();
            return Results.Ok(new ResetResponse(schemas));
        });

        // Le pool de test : 40 morceaux jouables et 5 sans extrait (rien si le pool n'est pas vide).
        e2e.MapPost("/seed-catalogue", async (InSecondsDbContext db, TimeProvider time, CancellationToken ct) =>
            Results.Ok(new SeedResponse(await CatalogueSeed.SeedAsync(db, time, ct))));

        // Dernier email envoyé à une adresse (lien de connexion, confirmation de changement d'email).
        e2e.MapGet("/last-email", (string to, CapturingEmailSender emails) =>
            emails.LastTo(to) is { } email ? Results.Ok(email) : Results.NotFound());

        return routes;
    }
}

public sealed record ResetResponse(IReadOnlyList<string> Schemas);

public sealed record SeedResponse(int Added);
