namespace InSeconds.Api.Features.Sessions.AbandonSession;

public sealed record AbandonSessionCommand(Guid PlayerId, int SessionId);
