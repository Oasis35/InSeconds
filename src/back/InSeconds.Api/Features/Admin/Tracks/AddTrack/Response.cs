namespace InSeconds.Api.Features.Admin.Tracks.AddTrack;

public sealed record AddTrackResponse(int Id, string Artist, string Title, long DeezerTrackId);
