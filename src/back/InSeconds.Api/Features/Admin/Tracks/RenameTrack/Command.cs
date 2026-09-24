namespace InSeconds.Api.Features.Admin.Tracks.RenameTrack;

public sealed record RenameTrackCommand(int TrackId, string Artist, string Title);
