using InSeconds.Api.Testing.Email;

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

        // Vide les tables des modules et les emails capturés.
        e2e.MapPost("/reset", async (DatabaseResetter resetter, CapturingEmailSender emails, CancellationToken ct) =>
        {
            var schemas = await resetter.ResetAsync(ct);
            emails.Clear();
            return Results.Ok(new ResetResponse(schemas));
        });

        // Dernier email envoyé à une adresse (lien de connexion, confirmation de changement d'email).
        e2e.MapGet("/last-email", (string to, CapturingEmailSender emails) =>
            emails.LastTo(to) is { } email ? Results.Ok(email) : Results.NotFound());

        return routes;
    }
}

public sealed record ResetResponse(IReadOnlyList<string> Schemas);
