namespace InSeconds.Api.Features.Admin.Players.GetPlayerHistory;

public sealed record PlayerHistoryResponse(IReadOnlyList<PlayerHistoryEntryDto> Games);

// Status : "Completed" / "Pending" (en cours, aujourd'hui) / "Abandoned" (bouton) / "Expired"
// (Pending d'un jour passé, même repli que les stats admin). Score = null hors Completed.
public sealed record PlayerHistoryEntryDto(
    DateOnly Date,
    string Status,
    int? Score,
    int FreezesUsed,
    bool FreezeEarned);
