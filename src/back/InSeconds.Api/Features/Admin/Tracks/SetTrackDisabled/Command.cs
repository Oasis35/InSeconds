namespace InSeconds.Api.Features.Admin.Tracks.SetTrackDisabled;

public sealed record SetTrackDisabledCommand(int TrackId, bool IsDisabled);
