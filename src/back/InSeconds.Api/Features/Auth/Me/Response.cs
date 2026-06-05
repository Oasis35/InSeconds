namespace InSeconds.Api.Features.Auth.Me;

public sealed record MeResponse(
    Guid Id,
    bool IsGuest,
    string? Pseudo);
