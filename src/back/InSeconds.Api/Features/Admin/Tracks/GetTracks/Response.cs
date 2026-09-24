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
    // Morceau dans une partie encore en cours : non renommable avant demain (cf. RenameLock).
    bool RenameLocked = false);
