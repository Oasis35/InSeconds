namespace InSeconds.Api.Features.Admin.Players.GetRegisteredPlayers;

public sealed record RegisteredPlayersResponse(IReadOnlyList<RegisteredPlayerDto> Players);

// LastSeenAt = dernière requête authentifiée par le cookie du joueur (PlayerAuthMiddleware),
// donc la dernière visite sur le site, pas seulement le dernier passage par le magic link.
public sealed record RegisteredPlayerDto(
    Guid Id,
    string? Pseudo,
    string? Email,
    DateTime CreatedAt,
    DateTime? LastSeenAt,
    int GamesPlayed,
    bool IsAdmin);
