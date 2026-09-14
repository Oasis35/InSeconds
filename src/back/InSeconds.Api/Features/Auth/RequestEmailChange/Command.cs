namespace InSeconds.Api.Features.Auth.RequestEmailChange;

public sealed record RequestEmailChangeCommand(Guid PlayerId, string NewEmail);
