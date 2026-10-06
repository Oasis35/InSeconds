namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>Les informations d'un morceau chez Deezer, au moment de l'ajout ou de l'actualisation.</summary>
/// <param name="CoverHash">Hash de la pochette seulement : l'adresse se reconstruit avec <c>Catalogue:CoverUrlTemplate</c>.</param>
/// <param name="Preview">L'état de l'extrait lu dans la même réponse : <see cref="PreviewStatus.Available"/> ou <see cref="PreviewStatus.Missing"/>.</param>
public sealed record TrackMetadata(
    long DeezerTrackId, string Artist, string Title, string? CoverHash, short? ReleaseYear, int? Rank, PreviewStatus Preview);

/// <summary>
/// Un morceau du pool (§ 4.3 du plan v2) : ce que le jeu fait écouter, avec son extrait, son année, son rang
/// Deezer. Les noms (<see cref="Artist"/>, <see cref="Title"/>) sont la référence de correction des réponses.
/// Rien ne le lie à un défi : l'usage (dernier jour, nombre d'utilisations) se calcule dans Daily et
/// s'obtient par <c>ITrackUsage</c>.
/// </summary>
public sealed class Track
{
    private Track()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence), pour figurer dans la réponse avant l'enregistrement.</summary>
    public int Id { get; private set; }

    public long DeezerTrackId { get; private set; }

    public string Artist { get; private set; } = null!;

    public string Title { get; private set; } = null!;

    public string? CoverHash { get; private set; }

    public short? ReleaseYear { get; private set; }

    /// <summary>Rang (popularité) chez Deezer, qui servira à la difficulté de Runs.</summary>
    public int? DeezerRank { get; private set; }

    public DateTimeOffset? RankUpdatedAt { get; private set; }

    public PreviewStatus PreviewStatus { get; private set; }

    public DateTimeOffset? PreviewCheckedAt { get; private set; }

    /// <summary>Retiré du tirage par l'admin (reste dans le pool, réactivable).</summary>
    public DateTimeOffset? DisabledAt { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset? UpdatedAt { get; private set; }

    public bool IsDisabled => DisabledAt is not null;

    public bool HasPreview => PreviewStatus == PreviewStatus.Available;

    public static Track Create(TrackMetadata metadata, DateTimeOffset now)
    {
        var track = new Track { CreatedAt = now };
        track.Apply(metadata, now);
        return track;
    }

    /// <summary>
    /// Corrige l'artiste et le titre (faute, nom Deezer peu reconnaissable), à tout moment, défi du jour
    /// compris : les réponses déjà enregistrées gardent leur verdict, les suivantes sont corrigées avec le
    /// nouveau nom. L'identifiant Deezer ne change pas.
    /// </summary>
    public void Rename(string artist, string title, DateTimeOffset now)
    {
        // Les deux noms sont vérifiés avant d'en changer un : un refus ne laisse rien à moitié modifié.
        var newArtist = RequireText(artist, nameof(artist));
        var newTitle = RequireText(title, nameof(title));
        Artist = newArtist;
        Title = newTitle;
        UpdatedAt = now;
    }

    /// <summary>Retire le morceau du tirage. Sans effet s'il l'est déjà.</summary>
    public void Disable(DateTimeOffset now)
    {
        if (IsDisabled)
            return;

        DisabledAt = now;
        UpdatedAt = now;
    }

    /// <summary>Remet le morceau dans le tirage. Sans effet s'il n'est pas désactivé.</summary>
    public void Enable(DateTimeOffset now)
    {
        if (!IsDisabled)
            return;

        DisabledAt = null;
        UpdatedAt = now;
    }

    /// <summary>
    /// Note le résultat d'un contrôle de l'extrait. <see cref="PreviewCheck.Unavailable"/> ne change rien, pas
    /// même la date du contrôle : l'état du morceau reste celui du dernier contrôle réussi (piège 16).
    /// </summary>
    /// <returns>Vrai si l'état de l'extrait a changé.</returns>
    public bool RecordPreviewCheck(PreviewCheck check, DateTimeOffset now)
    {
        if (check == PreviewCheck.Unavailable)
            return false;

        var status = check == PreviewCheck.Available ? PreviewStatus.Available : PreviewStatus.Missing;
        var changed = PreviewStatus != status;
        PreviewStatus = status;
        PreviewCheckedAt = now;
        if (changed)
            UpdatedAt = now;
        return changed;
    }

    public void RecordRank(int rank, DateTimeOffset now)
    {
        DeezerRank = rank;
        RankUpdatedAt = now;
    }

    /// <summary>
    /// Actualise un morceau sans extrait : remplace tout ce qui vient de Deezer (identifiant, noms, pochette,
    /// année, rang, extrait). Interdit pour un morceau déjà utilisé : la règle est dans l'endpoint (usage).
    /// </summary>
    public void ReplaceDeezerSource(TrackMetadata metadata, DateTimeOffset now)
    {
        Apply(metadata, now);
        UpdatedAt = now;
    }

    private void Apply(TrackMetadata metadata, DateTimeOffset now)
    {
        DeezerTrackId = metadata.DeezerTrackId;
        Artist = RequireText(metadata.Artist, nameof(metadata.Artist));
        Title = RequireText(metadata.Title, nameof(metadata.Title));
        CoverHash = metadata.CoverHash;
        ReleaseYear = metadata.ReleaseYear;
        PreviewStatus = metadata.Preview;
        PreviewCheckedAt = metadata.Preview == PreviewStatus.Unknown ? null : now;

        DeezerRank = metadata.Rank;
        RankUpdatedAt = metadata.Rank is null ? null : now;
    }

    private static string RequireText(string value, string name) =>
        string.IsNullOrWhiteSpace(value) ? throw new ArgumentException("Le texte ne peut pas être vide.", name) : value.Trim();
}
