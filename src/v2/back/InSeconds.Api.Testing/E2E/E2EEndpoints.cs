using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Domain;
using InSeconds.Api.Testing.Deezer;
using InSeconds.Api.Testing.Email;
using InSeconds.Deezer;
using Microsoft.EntityFrameworkCore;
using Wolverine;

namespace InSeconds.Api.Testing.E2E;

/// <summary>
/// Routes réservées aux tests (E2E Playwright), servies uniquement par l'hôte de test : l'API de prod
/// ne les connaît pas (S9). À compléter au fil des modules (seed, connexion admin, défi du jour…).
/// </summary>
public static class E2EEndpoints
{
    public const string Prefix = "/api/e2e";
    public const string AdminEmail = "admin-e2e@e2e.test";
    public const string AdminPseudo = "AdminE2E";

    public static IServiceCollection AddE2E(this IServiceCollection services)
    {
        services.AddSingleton<DatabaseResetter>();
        return services;
    }

    public static IEndpointRouteBuilder MapE2EEndpoints(this IEndpointRouteBuilder routes)
    {
        var e2e = routes.MapGroup(Prefix).ExcludeFromDescription();

        // Vide les tables des modules, les emails capturés, et remet le faux Deezer et son cache à zéro.
        e2e.MapPost("/reset", async (
            DatabaseResetter resetter, CapturingEmailSender emails, FakeDeezerState deezer, DeezerCache deezerCache, CancellationToken ct) =>
            Results.Ok(new ResetResponse(await ResetAsync(resetter, emails, deezer, deezerCache, ct))));

        // Le pool de test : 50 morceaux jouables et 5 sans extrait, avec leurs défis (rien si le pool n'est pas vide).
        e2e.MapPost("/seed-catalogue", async (InSecondsDbContext db, TimeProvider time, CancellationToken ct) =>
            Results.Ok(new SeedResponse(await CatalogueSeed.SeedAsync(db, time, ct))));

        // Remise à zéro complète puis seed du catalogue (le fixture E2E de la v1 l'appelle avec un jeton admin, ignoré ici).
        e2e.MapPost("/reseed", async (
            DatabaseResetter resetter, CapturingEmailSender emails, FakeDeezerState deezer, DeezerCache deezerCache,
            InSecondsDbContext db, TimeProvider time, CancellationToken ct) =>
        {
            await ResetAsync(resetter, emails, deezer, deezerCache, ct);
            return Results.Ok(new SeedResponse(await CatalogueSeed.SeedAsync(db, time, ct)));
        });

        // Génère le défi du jour tout de suite, sans Hangfire (les fixtures qui ont juste besoin d'un défi, § 5.4 bis du plan v2) :
        // 200 avec { created } (false si le défi existait déjà), 422 admin.pool_insufficient si le pool ne suffit pas.
        e2e.MapPost("/generate-today", async (IMessageBus bus, IGameCalendar calendar, CancellationToken ct) =>
        {
            var result = await bus.InvokeAsync<GenerateChallengeResult>(new GenerateDailyChallenge(calendar.Today, ChallengeOrigin.Admin), ct);
            return result.Outcome == GenerationOutcome.PoolInsufficient
                ? Results.UnprocessableEntity(new { code = DailyAdminErrorCodes.PoolInsufficient, eligible = result.EligibleCount, required = result.Requested })
                : Results.Ok(new GenerateTodayResponse(result.Outcome == GenerationOutcome.Created, result.TrackCount));
        });

        // Connecte le navigateur appelant comme un compte lié admin dédié aux tests (créé au besoin), par le chemin du dev-login.
        e2e.MapPost("/login-as-admin", async (AccountSignIn accountSignIn, InSecondsDbContext db, CancellationToken ct) =>
        {
            var plan = await accountSignIn.PrepareAsync(AdminEmail, AdminPseudo, ct);
            // Après un reset, le cache de validation (une minute) peut encore croire à l'ancien joueur du cookie : il n'existe plus.
            if (plan.GuestToConvert is { } guest && !await db.Set<Player>().AnyAsync(p => p.Id == guest, ct))
                plan = plan with { GuestToConvert = null, PreviousDeviceSession = null };
            if (plan.AccountUnavailable || plan.PseudoTaken)
                return Results.Conflict();

            // Hors de Wolverine : pas de transaction automatique, et le gel offert à la création du compte prend un verrou qui en exige une.
            // Le compte doit exister avant d'être promu.
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var result = await accountSignIn.ExecuteAsync(plan, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            // Le rôle est relu en base à chaque validation de session (cache d'une minute) ; la session vient d'être
            // créée : aucune validation périmée n'est en cache, la requête suivante voit déjà le rôle admin.
            await db.Set<Account>().Where(a => a.PlayerId == result.PlayerId)
                .ExecuteUpdateAsync(set => set.SetProperty(a => a.IsAdmin, true), ct);
            return Results.Ok();
        });

        // Dernier email envoyé à une adresse (lien de connexion, confirmation de changement d'email).
        e2e.MapGet("/last-email", (string to, CapturingEmailSender emails) =>
            emails.LastTo(to) is { } email ? Results.Ok(email) : Results.NotFound());

        return routes;
    }

    private static async Task<IReadOnlyList<string>> ResetAsync(
        DatabaseResetter resetter, CapturingEmailSender emails, FakeDeezerState deezer, DeezerCache deezerCache, CancellationToken ct)
    {
        var schemas = await resetter.ResetAsync(ct);
        emails.Clear();
        deezer.Reset();
        deezerCache.Clear();
        return schemas;
    }

}

public sealed record ResetResponse(IReadOnlyList<string> Schemas);

public sealed record SeedResponse(int Added);

public sealed record GenerateTodayResponse(bool Created, int Tracks);
