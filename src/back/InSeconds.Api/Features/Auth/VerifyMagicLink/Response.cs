namespace InSeconds.Api.Features.Auth.VerifyMagicLink;

public sealed record VerifyMagicLinkResponse(bool NeedsPseudo);

// Enveloppe interne : IResult à renvoyer au client + AuthToken pour lequel poser le
// cookie (résolu par le Handler, posé par l'Endpoint qui seul a accès à HttpContext —
// cf. pattern StartSession/CookieAuthService dans ce projet).
public sealed record VerifyMagicLinkOutcome(IResult ApiResult, Guid? AuthTokenToIssue);
