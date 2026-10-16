namespace InSeconds.Api.Modules.Players.Contracts;

/// <summary>
/// Le joueur de la requête en cours, lu dans le cookie validé (§ 5.3 du plan v2). Tout vide quand
/// le navigateur n'a pas d'identité.
/// </summary>
public interface ICurrentPlayer
{
    Guid? PlayerId { get; }

    int? DeviceSessionId { get; }

    /// <summary>Rôle admin relu en base par la validation du cookie (au plus une minute de retard).</summary>
    bool IsAdmin { get; }
}
