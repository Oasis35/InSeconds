namespace InSeconds.Api.Infrastructure.Operations;

/// <summary>
/// Une sauvegarde nocturne réussie de la base de prod, notée par <c>deploy/infra/backup.sh</c> lui-même (l'API n'en écrit jamais) et lue
/// par l'état technique de l'admin. Le staging n'en a pas : sa base est copiée de la prod, puis cette table est vidée par <c>staging-anonymize.sql</c>.
/// </summary>
public sealed class BackupRun
{
    /// <summary>Fin de la sauvegarde (heure de la base).</summary>
    public DateTimeOffset FinishedAt { get; private set; }

    /// <summary>La sauvegarde a quitté le VPS (envoi chiffré vers R2).</summary>
    public bool OffSite { get; private set; }
}
