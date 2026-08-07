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
    DateOnly? UnlockDate = null);
