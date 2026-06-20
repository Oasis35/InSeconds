namespace InSeconds.Api.Features.Admin.Tracks.UpdateTrack;

public sealed record UpdateTrackResponse(int Id, string Artist, string Title, long DeezerTrackId);
