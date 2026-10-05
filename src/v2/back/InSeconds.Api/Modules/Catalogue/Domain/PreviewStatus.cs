namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>
/// Ce que l'on sait de l'extrait audio d'un morceau (§ 4.3 du plan v2). <see cref="Unknown"/> n'existe qu'avant
/// le premier contrôle ; ensuite, seul un contrôle qui a obtenu une réponse de Deezer change l'état.
/// Valeurs stockées en base (<c>preview_status</c>) : ne jamais les changer.
/// </summary>
public enum PreviewStatus
{
    Unknown = 0,
    Available = 1,
    Missing = 2,
}

/// <summary>
/// Résultat d'un contrôle de l'extrait par Deezer. <see cref="Unavailable"/> (quota, panne, service occupé)
/// n'est pas un état du morceau : <see cref="Track.RecordPreviewCheck"/> l'ignore, c'est le bug qui avait
/// marqué à tort ~200 morceaux « sans preview » (piège 16 du CLAUDE.md racine).
/// </summary>
public enum PreviewCheck
{
    Available,
    Missing,
    Unavailable,
}
