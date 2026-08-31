namespace InSeconds.Api.Features.Auth.DevLogin;

public sealed record DevLoginCommand(string Email, Guid CurrentGuestPlayerId);
