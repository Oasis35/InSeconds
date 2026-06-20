namespace InSeconds.Api.Features.Admin.Tracks.UpdateTrack;

public sealed record UpdateTrackCommand(int TrackId, long NewDeezerTrackId);
