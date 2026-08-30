namespace InSeconds.Api.Features.Auth.VerifyMagicLink;

public sealed record VerifyMagicLinkCommand(string Token, string? Pseudo, Guid CurrentGuestPlayerId);
