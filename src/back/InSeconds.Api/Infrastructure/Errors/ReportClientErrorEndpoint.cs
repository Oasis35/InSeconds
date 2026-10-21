using FluentValidation;
using InSeconds.Infrastructure.Http;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Infrastructure.Errors;

/// <summary>
/// Erreur remontée par le front (<c>ErrorReportingService</c>), même contrat qu'en v1 : <c>Source</c> =
/// <c>js</c> (exception JavaScript non gérée), <c>http</c> (appel API en échec réseau ou 5xx) ou
/// <c>csp</c> (violation de la Content-Security-Policy du front, G3).
/// <c>RelatedTraceId</c> = code d'erreur renvoyé par l'API dans le ProblemDetails, quand il existe,
/// pour relier les deux côtés. Ajouts de la v2 : <c>AppVersion</c> = date de build du front
/// (<c>DEPLOYED_AT</c>, absente hors image Docker), pour repérer un onglet resté sur une ancienne version ;
/// <c>Online</c> = <c>navigator.onLine</c> au moment de l'erreur, pour séparer une coupure chez le joueur
/// d'une panne chez nous. Facultatifs : un front v1 encore en cache peut appeler sans eux.
/// </summary>
public sealed record ClientErrorReport(
    string Source,
    string Message,
    string? Stack,
    string? Url,
    int? HttpStatus,
    string? RelatedTraceId,
    string? AppVersion = null,
    bool? Online = null);

/// <summary>Endpoint public : bornes strictes, pour qu'un client ne puisse pas écrire des journaux géants.</summary>
public sealed class ClientErrorReportValidator : AbstractValidator<ClientErrorReport>
{
    public static readonly string[] AllowedSources = ["js", "http", "csp"];

    public ClientErrorReportValidator()
    {
        RuleFor(x => x.Source).Must(s => AllowedSources.Contains(s));
        RuleFor(x => x.Message).NotEmpty().MaximumLength(1000);
        RuleFor(x => x.Stack).MaximumLength(8000);
        RuleFor(x => x.Url).MaximumLength(500);
        RuleFor(x => x.HttpStatus).InclusiveBetween(0, 599).When(x => x.HttpStatus is not null);
        RuleFor(x => x.RelatedTraceId).MaximumLength(64);
        RuleFor(x => x.AppVersion).MaximumLength(40);
    }
}

public static class ReportClientErrorEndpoint
{
    /// <summary>Séparateur des lignes de la pile une fois aplatie.</summary>
    internal const char StackLineSeparator = '|';

    /// <summary>
    /// Public (un visiteur sans compte peut aussi rencontrer une erreur), limité par IP, hors OpenAPI :
    /// appelé par <c>ErrorReportingService</c>, pas par le client généré. Journalisé en Error, comme une
    /// exception de l'API, pour remonter dans les mêmes alertes. L'appareil est le libellé grossier tiré
    /// du <c>User-Agent</c> de cette requête (<see cref="DeviceLabel"/>), jamais l'en-tête brut.
    /// </summary>
    [WolverinePost("/api/client-errors")]
    [EnableRateLimiting(RateLimitPolicies.ClientErrorReport)]
    [ExcludeFromDescription]
    [EmptyResponse]
    public static void Post(ClientErrorReport report, HttpRequest request, ILogger<ClientErrorReport> logger)
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
            ToSingleLine(report.AppVersion, ' '),
            report.Online,
            DeviceLabel.From(request.Headers.UserAgent),
            ToSingleLine(report.Stack, StackLineSeparator));
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
/// Même identifiant et mêmes champs qu'en v1 (<c>PlayerActionLog.ClientError</c>), plus <c>AppVersion</c>,
/// <c>Online</c> et <c>Device</c> : les tableaux de bord existants (qui cherchent « Erreur front ») continuent
/// de fonctionner. L'identité du joueur vient du scope posé par <c>PlayerTelemetryMiddleware</c>.
/// </summary>
internal static partial class ClientErrorLog
{
    [LoggerMessage(EventId = 1100, Level = LogLevel.Error,
        Message = "Erreur front ({Source}) sur {Url} : {ClientMessage} (HTTP {HttpStatus}, trace liée {RelatedTraceId}, version {AppVersion}, en ligne {Online}, appareil {Device}) - stack : {ClientStack}")]
    public static partial void ClientError(ILogger logger, string source, string? url, string clientMessage,
        int? httpStatus, string? relatedTraceId, string? appVersion, bool? online, string? device, string? clientStack);
}
