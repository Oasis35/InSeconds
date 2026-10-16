namespace InSeconds.Api.Infrastructure.Errors;

/// <summary>
/// Codes d'erreur stables, renvoyés dans le champ <c>code</c> de chaque <c>ProblemDetails</c>.
/// Le front traduit un code en message (table unique, § 6.6 du plan v2) : ne jamais renommer un
/// code existant. Les modules ajoutent les leurs, préfixés par leur nom (<c>daily.already_played</c>).
/// </summary>
public static class ErrorCodes
{
    public const string Unexpected = "common.unexpected";
    public const string NotFound = "common.not_found";
    public const string BadRequest = "common.bad_request";
    public const string Unauthorized = "common.unauthorized";
    public const string Forbidden = "common.forbidden";
    public const string Conflict = "common.conflict";
    public const string TooManyRequests = "common.too_many_requests";

    /// <summary>Code par défaut d'une réponse d'erreur qui n'en porte pas déjà un.</summary>
    public static string ForStatus(int statusCode) => statusCode switch
    {
        StatusCodes.Status400BadRequest => BadRequest,
        StatusCodes.Status401Unauthorized => Unauthorized,
        StatusCodes.Status403Forbidden => Forbidden,
        StatusCodes.Status404NotFound => NotFound,
        StatusCodes.Status409Conflict => Conflict,
        StatusCodes.Status429TooManyRequests => TooManyRequests,
        _ => Unexpected,
    };
}
