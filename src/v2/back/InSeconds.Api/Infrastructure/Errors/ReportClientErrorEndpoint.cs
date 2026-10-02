using FluentValidation;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Infrastructure.Errors;

/// <summary>
/// Erreur remontée par le front (<c>ErrorReportingService</c>), même contrat qu'en v1 : <c>Source</c> =
/// <c>js</c> (exception JavaScript non gérée) ou <c>http</c> (appel API en échec réseau ou 5xx).
/// <c>RelatedTraceId</c> = code d'erreur renvoyé par l'API dans le ProblemDetails, quand il existe,
/// pour relier les deux côtés.
/// </summary>
public sealed record ClientErrorReport(
    string Source,
    string Message,
    string? Stack,
    string? Url,
    int? HttpStatus,
    string? RelatedTraceId);

/// <summary>Endpoint public : bornes strictes, pour qu'un client ne puisse pas écrire des journaux géants.</summary>
public sealed class ClientErrorReportValidator : AbstractValidator<ClientErrorReport>
{
    public static readonly string[] AllowedSources = ["js", "http"];

    public ClientErrorReportValidator()
    {
        RuleFor(x => x.Source).Must(s => AllowedSources.Contains(s));
        RuleFor(x => x.Message).NotEmpty().MaximumLength(1000);
        RuleFor(x => x.Stack).MaximumLength(8000);
        RuleFor(x => x.Url).MaximumLength(500);
        RuleFor(x => x.HttpStatus).InclusiveBetween(0, 599).When(x => x.HttpStatus is not null);
        RuleFor(x => x.RelatedTraceId).MaximumLength(64);
    }
}

public static class ReportClientErrorEndpoint
{
    /// <summary>Séparateur des lignes de la pile une fois aplatie.</summary>
    internal const char StackLineSeparator = '|';

    /// <summary>
    /// Public (un visiteur sans compte peut aussi rencontrer une erreur), limité par IP, hors OpenAPI :
    /// appelé par <c>ErrorReportingService</c>, pas par le client généré. Journalisé en Error, comme une
    /// exception de l'API, pour remonter dans les mêmes alertes.
    /// </summary>
    [WolverinePost("/api/client-errors")]
    [EnableRateLimiting(RateLimitPolicies.ClientErrorReport)]
    [ExcludeFromDescription]
    public static IResult Post(ClientErrorReport report, ILogger<ClientErrorReport> logger)
    {
        // Tous les champs viennent du navigateur : retours à la ligne neutralisés, pour qu'un client ne
        // puisse pas écrire de fausses lignes dans les journaux texte. Jamais de query string ni de
        // fragment (jeton de lien magique, recherche tapée), même si un client en envoie une.
        ClientErrorLog.ClientError(logger,
            ToSingleLine(report.Source, ' ')!,
            ToSingleLine(WithoutQuery(report.Url), ' '),
            ToSingleLine(report.Message, ' ')!,
            report.HttpStatus,
            ToSingleLine(report.RelatedTraceId, ' '),
            ToSingleLine(report.Stack, StackLineSeparator));

        return Results.NoContent();
    }

    internal static string? ToSingleLine(string? value, char separator) =>
        value?.Replace('\r', separator).Replace('\n', separator);

    internal static string? WithoutQuery(string? url)
    {
        if (url is null)
            return null;
        var cut = url.IndexOfAny(['?', '#']);
        return cut < 0 ? url : url[..cut];
    }
}

/// <summary>
/// Mêmes identifiant et champs qu'en v1 (<c>PlayerActionLog.ClientError</c>) : les tableaux de bord
/// existants continuent de fonctionner. L'identité du joueur viendra du scope de journalisation posé
/// à partir de B1 (Players).
/// </summary>
internal static partial class ClientErrorLog
{
    [LoggerMessage(EventId = 1100, Level = LogLevel.Error,
        Message = "Erreur front ({Source}) sur {Url} : {ClientMessage} (HTTP {HttpStatus}, trace liée {RelatedTraceId}) — stack : {ClientStack}")]
    public static partial void ClientError(ILogger logger, string source, string? url, string clientMessage,
        int? httpStatus, string? relatedTraceId, string? clientStack);
}
