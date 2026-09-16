namespace InSeconds.Api.Common.Auth;

public sealed record PlayerAuthResolution(Guid PlayerId, bool IsAdmin);
