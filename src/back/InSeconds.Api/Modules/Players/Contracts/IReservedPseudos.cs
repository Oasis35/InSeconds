namespace InSeconds.Api.Modules.Players.Contracts;

/// <summary>
/// Les noms qu'un autre module a déjà donnés et qu'un compte ne peut donc pas prendre comme pseudo : les alias du classement général (Social). Défini
/// par Players, implémenté par Social (une seule implémentation, enregistrée par <c>AddSocial</c>) : Players ne connaît pas Social, Social ne lit pas
/// les tables de Players. Réciproquement, Social ne tire jamais un alias égal au pseudo d'un compte (<see cref="IPlayerDirectory.IsPseudoTakenAsync"/>).
/// </summary>
public interface IReservedPseudos
{
    /// <summary>Ce nom (sans la casse) est-il déjà pris par un autre joueur que <paramref name="exceptPlayerId"/> ?</summary>
    Task<bool> IsReservedAsync(string name, Guid? exceptPlayerId, CancellationToken ct);
}
