namespace InSeconds.Api.Common.Auth;

// Pseudo : null pour un invité (contrainte guest ⇔ pseudo) ; sert à lire les journaux par joueur.
public sealed record PlayerAuthResolution(Guid PlayerId, bool IsAdmin, string? Pseudo = null);
