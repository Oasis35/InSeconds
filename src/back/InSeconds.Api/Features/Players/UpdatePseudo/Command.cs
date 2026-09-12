namespace InSeconds.Api.Features.Players.UpdatePseudo;

public sealed record UpdatePseudoCommand(Guid PlayerId, string Pseudo);
