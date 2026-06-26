namespace InSeconds.Api.Features.Sessions.UpdateListening;

public sealed record UpdateListeningCommand(Guid PlayerId, int SessionId, int TrackId, decimal ListenedSeconds);
