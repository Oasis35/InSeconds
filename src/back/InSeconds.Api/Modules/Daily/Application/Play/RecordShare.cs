using FluentValidation;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Le joueur vient de partager son score dans ce format : <c>short</c> (✅ / 🔶 / 🅾️) ou <c>long</c> (une ligne par morceau).</summary>
public sealed record RecordShare(string Format)
{
    public const string ShortFormat = "short";
    public const string LongFormat = "long";

    public ShareFormat ToShareFormat() => Format == LongFormat ? ShareFormat.Long : ShareFormat.Short;
}

public sealed class RecordShareValidator : AbstractValidator<RecordShare>
{
    public RecordShareValidator() =>
        RuleFor(x => x.Format)
            .Must(f => f is RecordShare.ShortFormat or RecordShare.LongFormat)
            .WithMessage("Le format doit être « short » ou « long ».");
}

public static class RecordShareEndpoint
{
    /// <summary>
    /// <c>POST /api/daily/shares</c> : compte un partage du score, envoyé par le front quand le menu de partage du téléphone a été validé ou que le
    /// texte a été copié. Seul le total du jour de jeu et du format augmente : rien n'est gardé du joueur en base (l'encart « Partages » de l'admin).
    /// Réservé à un joueur identifié (on partage après avoir joué) et limité par joueur, pour qu'un script ne gonfle pas les chiffres.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/daily/shares", OperationId = "recordShare")]
    [EnableRateLimiting(RateLimitPolicies.DailyShare)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    [EmptyResponse]
    public static Task Post(RecordShare request, IDailyStore store, IGameCalendar calendar, CancellationToken ct) =>
        store.RecordShareAsync(calendar.Today, request.ToShareFormat(), ct);
}
