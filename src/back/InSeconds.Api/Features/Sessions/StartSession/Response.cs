namespace InSeconds.Api.Features.Sessions.StartSession;

public sealed record StartSessionResponse(
    int SessionId,
    IReadOnlyList<TrackSlot> Tracks);

public sealed record TrackSlot(
    int Id,
    int Position,
    string PreviewUrl,
    string? CoverUrl);
