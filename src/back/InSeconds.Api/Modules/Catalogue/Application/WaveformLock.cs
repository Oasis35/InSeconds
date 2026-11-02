namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>
/// Un seul calcul de formes à la fois : le contrôle nocturne (étape de <c>catalogue-refresh</c>) et le passage qui suit l'ajout d'un morceau ne se
/// croisent jamais (même quota Deezer, mêmes téléchargements, piège 16). Le verrou est un verrou consultatif PostgreSQL de session, pris sur une
/// connexion à part : il tient tant que la connexion est ouverte, et tombe tout seul si le processus meurt.
/// </summary>
public interface IWaveformLock
{
    /// <summary>Prend le verrou s'il est libre, sans attendre. <c>null</c> : un autre calcul est en cours.</summary>
    Task<IAsyncDisposable?> TryAcquireAsync(CancellationToken ct);
}
