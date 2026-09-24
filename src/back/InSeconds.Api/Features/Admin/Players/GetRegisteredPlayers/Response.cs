namespace InSeconds.Api.Features.Admin.Players.GetRegisteredPlayers;

public sealed record RegisteredPlayersResponse(IReadOnlyList<RegisteredPlayerDto> Players);

// LastSeenAt = dernière requête authentifiée par le cookie du joueur (PlayerAuthMiddleware),
// donc la dernière visite sur le site, pas seulement le dernier passage par le magic link.
// CurrentStreak = série effective (0 si cassée) ; StreakProtected = jours manqués couverts par les gels.
public sealed record RegisteredPlayerDto(
    Guid Id,
    string? Pseudo,
    string? Email,
    DateTime CreatedAt,
    DateTime? LastSeenAt,
    int GamesPlayed,
    bool IsAdmin,
    int CurrentStreak,
    int StreakFreezes,
    bool StreakProtected);
