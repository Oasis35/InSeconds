namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>Les informations d'un morceau chez Deezer, au moment de l'ajout ou de l'actualisation.</summary>
/// <param name="CoverHash">Hash de la pochette seulement : l'adresse se reconstruit avec <c>Catalogue:CoverUrlTemplate</c>.</param>
/// <param name="Preview">L'état de l'extrait lu dans la même réponse : <see cref="PreviewStatus.Available"/> ou <see cref="PreviewStatus.Missing"/>.</param>
/// <param name="AlbumId">L'album chez Deezer, lu dans la même réponse : c'est lui qui porte les genres du morceau.</param>
public sealed record TrackMetadata(
    long DeezerTrackId, string Artist, string Title, string? CoverHash, short? ReleaseYear, int? Rank, PreviewStatus Preview, long? AlbumId);

/// <summary>
/// Un morceau du pool : ce que le jeu fait écouter, avec son extrait, son année, son rang
/// Deezer. Les noms (<see cref="Artist"/>, <see cref="Title"/>) sont la référence de correction des réponses.
/// Rien ne le lie à un défi : l'usage (dernier jour, nombre d'utilisations) se calcule dans Daily et
/// s'obtient par <c>ITrackUsage</c>.
/// </summary>
public sealed class Track
{
    private readonly List<Genre> _genres = [];

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

    /// <summary>L'album chez Deezer : les genres se lisent sur lui (un appel par album, pas par morceau).</summary>
    public long? AlbumId { get; private set; }

    /// <summary>
    /// Quand les genres de l'album ont été lus chez Deezer, **même s'il n'en a aucun** (album supprimé, ou sans genre) : vide, ils ne sont
    /// pas encore connus et le contrôle nocturne les rattrape ; renseigné, ils ne sont plus redemandés.
    /// </summary>
    public DateTimeOffset? GenresCheckedAt { get; private set; }

    /// <summary>
    /// Les genres ont été saisis à la main par l'admin (Deezer n'en donnait pas) : une lecture de Deezer qui en rend les remplace, une lecture
    /// vide les laisse, et le contrôle nocturne les relit chaque mois (<see cref="GenresNeedReading"/>).
    /// </summary>
    public bool GenresManual { get; private set; }

    /// <summary>Les genres de l'album du morceau, vides tant qu'ils n'ont pas été lus ou si l'album n'en a pas.</summary>
    public IReadOnlyCollection<Genre> Genres => _genres;

    public PreviewStatus PreviewStatus { get; private set; }

    public DateTimeOffset? PreviewCheckedAt { get; private set; }

    /// <summary>
    /// La forme de l'extrait (barres et basses, environ 2 Ko, blob versionné de <c>InSeconds.Waveform</c>), calculée par l'API et envoyée avec le
    /// morceau. Vide tant qu'elle n'est pas calculée : le navigateur calcule alors la sienne. Seulement des nombres, jamais d'audio (piège 47).
    /// </summary>
    public byte[]? Waveform { get; private set; }

    /// <summary>
    /// Le nom du fichier de l'extrait dont la forme a été tirée (la partie de l'adresse Deezer avant le <c>?</c>, un md5 du contenu) : un autre nom
    /// veut dire que Deezer a remplacé l'extrait et que la forme est périmée.
    /// </summary>
    public string? WaveformSource { get; private set; }

    public DateTimeOffset? WaveformComputedAt { get; private set; }

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

    /// <summary>
    /// La forme est à (re)calculer : elle manque, elle est d'une version plus ancienne que <paramref name="currentVersion"/> (le premier octet du blob), ou
    /// l'extrait actuel n'est plus celui dont elle a été tirée (<paramref name="previewFile"/> : son nom de fichier chez Deezer).
    /// </summary>
    public bool NeedsWaveform(byte currentVersion, string previewFile) =>
        Waveform is not { Length: > 0 } || Waveform[0] != currentVersion || !string.Equals(WaveformSource, previewFile, StringComparison.Ordinal);

    /// <summary>Note la forme calculée de l'extrait dont le fichier s'appelle <paramref name="previewFile"/>.</summary>
    public void RecordWaveform(byte[] waveform, string previewFile, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(waveform);
        if (waveform.Length == 0)
            throw new ArgumentException("La forme ne peut pas être vide.", nameof(waveform));

        Waveform = waveform;
        WaveformSource = RequireText(previewFile, nameof(previewFile));
        WaveformComputedAt = now;
    }

    public void RecordRank(int rank, DateTimeOffset now)
    {
        DeezerRank = rank;
        RankUpdatedAt = now;
    }

    /// <summary>
    /// Note l'album lu chez Deezer. Un autre album que celui connu efface les genres (ils étaient ceux de l'ancien) et les remet à lire.
    /// </summary>
    public void RecordAlbum(long? albumId)
    {
        if (albumId is null || albumId == AlbumId)
            return;

        AlbumId = albumId;
        GenresCheckedAt = null;
        GenresManual = false;
        _genres.Clear();
    }

    /// <summary>Les genres de l'album, tels que Deezer vient de les donner (aucun si l'album n'en a pas) : remplace les précédents.</summary>
    public void RecordGenres(IEnumerable<Genre> genres, DateTimeOffset now)
    {
        var read = genres.DistinctBy(g => g.Id).ToList();
        GenresCheckedAt = now;
        // Deezer qui n'en donne toujours aucun laisse le genre saisi à la main ; sinon ses genres l'écrasent.
        if (read.Count == 0 && GenresManual)
            return;

        _genres.Clear();
        _genres.AddRange(read);
        GenresManual = false;
    }

    /// <summary>Les genres sont à lire chez Deezer : jamais lus, ou saisis à la main depuis plus de <paramref name="manualMaxAge"/>.</summary>
    public bool GenresNeedReading(DateTimeOffset now, TimeSpan manualMaxAge) =>
        GenresCheckedAt is null || (GenresManual && now - GenresCheckedAt.Value >= manualMaxAge);

    /// <summary>
    /// Le genre saisi par l'admin : il remplace ceux du morceau. Sans genre (<c>null</c>), les genres saisis à la main sont retirés et ceux de
    /// Deezer seront relus ; des genres de Deezer ne sont jamais touchés par un champ vidé.
    /// </summary>
    public void SetManualGenre(Genre? genre, DateTimeOffset now)
    {
        if (genre is not null)
        {
            _genres.Clear();
            _genres.Add(genre);
            GenresManual = true;
            GenresCheckedAt = now;
        }
        else if (GenresManual)
        {
            _genres.Clear();
            GenresManual = false;
            GenresCheckedAt = null;
        }

        UpdatedAt = now;
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

        // Un morceau remplacé par un autre (actualisation) peut changer d'album : les genres de l'ancien ne valent plus.
        if (metadata.AlbumId != AlbumId)
        {
            AlbumId = metadata.AlbumId;
            GenresCheckedAt = null;
            GenresManual = false;
            _genres.Clear();
        }
    }

    private static string RequireText(string value, string name) =>
        string.IsNullOrWhiteSpace(value) ? throw new ArgumentException("Le texte ne peut pas être vide.", name) : value.Trim();
}
