namespace InSeconds.Api.Features.Admin.Tracks.GetTracks;

public sealed record GetTracksResponse(
    IReadOnlyList<TrackDto> Available,
    IReadOnlyList<TrackDto> Used);

public sealed record TrackDto(
    int Id,
    string Artist,
    string Title,
    long DeezerTrackId,
    bool? HasPreview = null,
    DateOnly? LastUsedDate = null,
    int UsageCount = 0,
    DateOnly? UnlockDate = null,
    // Retiré du tirage des prochains défis par l'admin (cf. SetTrackDisabled).
    bool IsDisabled = false,
    // Morceau du défi du jour : non désactivable avant demain (cf. SetTrackDisabled).
    bool InTodayChallenge = false);
