namespace InSeconds.Api.Infrastructure.Operations;

/// <summary>
/// Un passage des scripts de sauvegarde de la base de prod, réussi ou non, noté par les scripts eux-mêmes (<c>deploy/infra/backup.sh</c> et
/// <c>backup-verify.sh</c> ; l'API n'en écrit jamais, et les scripts purgent les lignes de plus de 90 jours) et lu par l'état technique de
/// l'admin. Le staging n'en a pas : sa base est copiée de la prod, puis cette table est vidée par <c>staging-anonymize.sql</c>.
/// Aucune donnée de joueur : des noms de tables, des dates et des nombres de lignes.
/// </summary>
public sealed class BackupRun
{
    public long Id { get; private set; }

    /// <summary>Le passage : <see cref="BackupRunKinds"/>.</summary>
    public string Kind { get; private set; } = BackupRunKinds.Backup;

    /// <summary><see cref="BackupRunOutcomes"/>.</summary>
    public string Outcome { get; private set; } = BackupRunOutcomes.Ok;

    /// <summary>Début du passage ; vide pour les sauvegardes notées avant le contrôle de restauration.</summary>
    public DateTimeOffset? StartedAt { get; private set; }

    /// <summary>Fin du passage (heure de la base).</summary>
    public DateTimeOffset FinishedAt { get; private set; }

    /// <summary>Étape en échec (ex. <c>freshness</c>, <c>restore</c>, <c>content</c>) ; vide en réussite.</summary>
    public string? FailedStep { get; private set; }

    /// <summary>Message court d'un échec (500 caractères au plus) ; le journal complet est dans Grafana.</summary>
    public string? Message { get; private set; }

    /// <summary>Sauvegarde concernée : le fichier créé, ou pour un contrôle celui de R2 (<c>daily/inseconds-….dump</c>).</summary>
    public string? DumpName { get; private set; }

    public long? DumpSizeBytes { get; private set; }

    /// <summary>Heure du dump (pour un contrôle, celle de la sauvegarde contrôlée).</summary>
    public DateTimeOffset? DumpTakenAt { get; private set; }

    /// <summary>La sauvegarde a quitté le VPS (envoi chiffré vers R2) ; vide quand le passage s'est arrêté avant de le savoir.</summary>
    public bool? OffSite { get; private set; }
}

/// <summary>Valeurs de <see cref="BackupRun.Kind"/>, écrites par les scripts.</summary>
public static class BackupRunKinds
{
    /// <summary>La sauvegarde de la nuit (<c>backup.sh</c>).</summary>
    public const string Backup = "backup";

    /// <summary>Le contrôle de restauration (<c>backup-verify.sh</c>).</summary>
    public const string Verify = "verify";

    /// <summary>Une sauvegarde archivée à la main (<c>backup.sh archive</c>).</summary>
    public const string Archive = "archive";
}

/// <summary>Valeurs de <see cref="BackupRun.Outcome"/>.</summary>
public static class BackupRunOutcomes
{
    public const string Ok = "ok";
    public const string Failed = "failed";
}
