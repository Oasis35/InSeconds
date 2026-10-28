namespace InSeconds.Api.Modules.Daily.Contracts;

/// <summary>
/// Gels de série accordés par un autre module, dans sa propre transaction :
/// pas par l'outbox, le joueur doit voir son gel tout de suite (sinon toasts manquants ou double gel).
/// </summary>
public interface IStreakGrants
{
    /// <summary>
    /// Gel offert à la création d'un compte, par conversion d'un invité ou pour un nouveau joueur : le
    /// stock passe à au moins un gel. Appelé par Players, qui
    /// enregistre la transaction.
    /// </summary>
    Task GrantAccountCreationFreezeAsync(Guid playerId, CancellationToken ct);
}
