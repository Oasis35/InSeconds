namespace InSeconds.Api.Features.Auth.DevLogin;

public sealed record DevLoginOutcome(IResult ApiResult, Guid? AuthTokenToIssue);
