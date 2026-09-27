using InSeconds.Api.Common.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.E2E;

public static class E2EResetEndpoint
{
    public static IEndpointRouteBuilder MapE2EReset(this IEndpointRouteBuilder routes)
    {
        routes.MapDelete("/api/e2e/reset", async (
            HttpContext ctx,
            ApplicationDbContext db,
            bool deleteChallenge = false,
            bool emptyPool = false,
            CancellationToken ct = default) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            await db.GameSessionAnswers.ExecuteDeleteAsync(ct);
            await db.GameSessions.ExecuteDeleteAsync(ct);

            var devPlayerId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
            await db.Players
                .Where(p => p.Id != devPlayerId)
                .ExecuteDeleteAsync(ct);

            // Un test qui désactive un morceau du pool ne doit pas fausser les suivants.
            await db.Tracks
                .Where(t => t.IsDisabled)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDisabled, false), ct);

            if (deleteChallenge)
            {
                var today = DateOnly.FromDateTime(DateTime.UtcNow);
                await db.DailyChallenges
                    .Where(c => c.Date == today)
                    .ExecuteDeleteAsync(ct);
            }

            // Rend le pool insuffisant : depuis la génération paresseuse dans
            // StartSession, supprimer le défi ne suffit plus à obtenir l'écran
            // « pas de défi » (il renaîtrait au premier joueur). Restaurer via /reseed.
            if (emptyPool)
            {
                await db.Tracks.ExecuteUpdateAsync(
                    s => s.SetProperty(t => t.HasPreview, false), ct);
            }

            return Results.Ok(new { reset = true, challengeDeleted = deleteChallenge, poolEmptied = emptyPool });
        })
        .WithName("E2EReset")
        .WithTags("E2E");

        // Purge complète + re-seed : utilisé par les tests d'intégration pour repartir d'un état propre
        routes.MapPost("/api/e2e/reseed", async (
            HttpContext ctx,
            ApplicationDbContext db,
            CancellationToken ct = default) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            // IgnoreQueryFilters : supprime aussi les lignes des joueurs soft-deleted
            await db.GameSessionAnswers.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
            await db.GameSessions.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
            await db.Players.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
            await db.DailyChallengeTracks.ExecuteDeleteAsync(ct);
            await db.DailyChallenges.ExecuteDeleteAsync(ct);
            await db.Tracks.ExecuteDeleteAsync(ct);
            await db.MagicLinkTokens.ExecuteDeleteAsync(ct);
            await db.EmailChangeTokens.ExecuteDeleteAsync(ct);

            E2ESeedData.SeedData(db);

            return Results.Ok(new { reseeded = true });
        })
        .WithName("E2EReseed")
        .WithTags("E2E");

        // Raccourci E2E-only pour obtenir un vrai cookie authToken sur un compte IsAdmin=true,
        // sans passer par le flux magic-link complet à chaque test. Promeut le Player déjà
        // résolu (ou créé) depuis le cookie courant du navigateur — jamais un compte admin fixe
        // distinct — pour que l'identité reste continue si le navigateur a déjà joué avant
        // d'appeler cet endpoint (ex. tests qui vérifient qu'un joueur se reconnaît "toi" dans
        // les stats admin après avoir joué puis s'être connecté en admin sur le même navigateur).
        routes.MapPost("/api/e2e/login-as-admin", async (
            HttpContext ctx,
            ApplicationDbContext db,
            ICookieAuthService cookieAuth,
            CancellationToken ct = default) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            var playerId = await cookieAuth.ResolveOrCreatePlayerAsync(ctx, ct);
            var player = await db.Players.SingleAsync(p => p.Id == playerId, ct);
            if (!player.IsAdmin)
            {
                player.PromoteToAdminForTesting();
                await db.SaveChangesAsync(ct);
            }

            return Results.Ok();
        })
        .WithName("E2ELoginAsAdmin")
        .WithTags("E2E");

        // Utilisé par les tests d'intégration/E2E pour "recevoir" un magic link sans
        // vrai envoi de mail (NullEmailSender actif en Testing). Le token brut n'est
        // jamais stocké en base (seul son hash SHA-256 l'est) : impossible de
        // reconstruire l'URL depuis la BDD — on la relit depuis TestEmailCapture
        // (peuplé par NullEmailSender à chaque envoi), en extrayant le premier
        // href="..." du HTML de l'email.
        routes.MapGet("/api/e2e/last-magic-link", (
            HttpContext ctx,
            InSeconds.Api.Common.Email.TestEmailCapture capture,
            string email,
            CancellationToken ct = default) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            var normalizedEmail = email.Trim().ToLowerInvariant();

            if (!capture.TryGetLast(normalizedEmail, out var lastEmail))
                return Results.NotFound();

            var match = System.Text.RegularExpressions.Regex.Match(lastEmail.Html, "href=\"([^\"]+)\"");
            if (!match.Success)
                return Results.NotFound();

            return Results.Ok(new { url = match.Groups[1].Value });
        })
        .WithName("E2ELastMagicLink")
        .WithTags("E2E");

        // Même principe que /api/e2e/last-magic-link, pour le flux de changement d'email
        // (ConfirmEmailChangeEmailTemplate) — token brut jamais stocké en base.
        routes.MapGet("/api/e2e/last-email-change-link", (
            HttpContext ctx,
            InSeconds.Api.Common.Email.TestEmailCapture capture,
            string email,
            CancellationToken ct = default) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            var normalizedEmail = email.Trim().ToLowerInvariant();

            if (!capture.TryGetLast(normalizedEmail, out var lastEmail))
                return Results.NotFound();

            var match = System.Text.RegularExpressions.Regex.Match(lastEmail.Html, "href=\"([^\"]+)\"");
            if (!match.Success)
                return Results.NotFound();

            return Results.Ok(new { url = match.Groups[1].Value });
        })
        .WithName("E2ELastEmailChangeLink")
        .WithTags("E2E");

        // Pose directement l'état de série d'un joueur (Testing-only, admin requis) pour tester
        // les états du gel de série (protégée, perdue, palier) sans simuler des jours de jeu.
        // Le PlayerId du navigateur s'obtient via GET /api/players/me avec son cookie.
        routes.MapPost("/api/e2e/set-streak", async (
            HttpContext ctx,
            ApplicationDbContext db,
            SetStreakRequest request,
            CancellationToken ct = default) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            var player = await db.Players.SingleOrDefaultAsync(p => p.Id == request.PlayerId, ct);
            if (player is null)
                return Results.NotFound();

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            DateOnly? lastPlayedDate = request.LastPlayedDaysAgo is { } daysAgo ? today.AddDays(-daysAgo) : null;
            player.RestoreStreakForTesting(request.Streak, lastPlayedDate, request.Freezes);
            await db.SaveChangesAsync(ct);

            return Results.Ok();
        })
        .WithName("E2ESetStreak")
        .WithTags("E2E");

        // Lève une exception non gérée (Testing-only) : vérifie le gestionnaire d'erreurs global
        // (500 ProblemDetails + traceId) et, côté E2E, l'affichage du code d'erreur.
        routes.MapGet("/api/e2e/throw", () =>
        {
            throw new InvalidOperationException("Exception de test (e2e/throw)");
        })
        .ExcludeFromDescription();

        return routes;
    }
}

public sealed record SetStreakRequest(Guid PlayerId, int Streak, int? LastPlayedDaysAgo, int Freezes);
