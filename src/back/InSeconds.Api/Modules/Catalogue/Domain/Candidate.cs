namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>Où en est la lecture d'un candidat chez Deezer.</summary>
public enum CandidateStatus : short
{
    /// <summary>Importé, pas encore lu chez Deezer (ou Deezer n'a pas répondu : il sera relu).</summary>
    Pending = 0,

    /// <summary>Lu : artiste, titre, année, rang et état de l'extrait sont connus.</summary>
    Ready = 1,

    /// <summary>Deezer ne connaît pas (ou plus) ce morceau.</summary>
    NotFound = 2,
}

/// <summary>
/// Un morceau en attente de décision, dans le sas de l'admin : il n'est pas dans le pool, donc jamais tiré. L'admin l'écoute, puis l'ajoute au
/// pool (il quitte alors le sas) ou l'écarte (il reste, écarté, pour ne pas être importé de nouveau). Seules les métadonnées de Deezer sont
/// gardées, comme pour un morceau du pool (piège 47).
/// </summary>
public sealed class Candidate
{
    /// <summary>La longueur de la colonne de priorité.</summary>
    public const int MaxPriorityLength = 1;

    /// <summary>Le nombre de candidats qu'un import accepte d'un coup.</summary>
    public const int MaxImport = 1000;

    private Candidate()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence), pour que les messages de lecture le portent avant l'enregistrement.</summary>
    public int Id { get; private set; }

    public long DeezerTrackId { get; private set; }

    /// <summary>« A », « B » ou « C » si l'import en donnait une (indication de l'admin, jamais calculée) ; vide : sans priorité.</summary>
    public string? Priority { get; private set; }

    public CandidateStatus Status { get; private set; }

    public string? Artist { get; private set; }

    public string? Title { get; private set; }

    public string? CoverHash { get; private set; }

    public short? ReleaseYear { get; private set; }

    public int? Rank { get; private set; }

    public PreviewStatus PreviewStatus { get; private set; }

    public long? AlbumId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset? ReadAt { get; private set; }

    /// <summary>Écarté par l'admin : il n'est plus proposé tant qu'il n'est pas remis.</summary>
    public DateTimeOffset? DismissedAt { get; private set; }

    /// <summary>L'ajout au pool est demandé et pas encore fait (il passe par des messages espacés, pour le quota de Deezer).</summary>
    public DateTimeOffset? AddRequestedAt { get; private set; }

    public bool IsDismissed => DismissedAt is not null;

    public static Candidate Create(long deezerTrackId, string? priority, DateTimeOffset now)
    {
        if (deezerTrackId <= 0)
            throw new ArgumentOutOfRangeException(nameof(deezerTrackId));
        var candidate = new Candidate { DeezerTrackId = deezerTrackId, CreatedAt = now };
        candidate.SetPriority(priority);
        return candidate;
    }

    /// <summary>Une priorité valide : « A », « B » ou « C » (casse ignorée).</summary>
    public static bool IsValidPriority(string? priority) => priority is null or "" || priority.Trim().ToUpperInvariant() is "A" or "B" or "C";

    /// <summary>Pose la priorité (ou la retire : <c>null</c> ou vide).</summary>
    public void SetPriority(string? priority)
    {
        if (!IsValidPriority(priority))
            throw new ArgumentException("Une priorité est A, B ou C.", nameof(priority));
        Priority = string.IsNullOrWhiteSpace(priority) ? null : priority.Trim().ToUpperInvariant();
    }

    /// <summary>Note ce que Deezer a répondu : le morceau est lu.</summary>
    public void RecordRead(TrackMetadata metadata, DateTimeOffset now)
    {
        Status = CandidateStatus.Ready;
        Artist = metadata.Artist;
        Title = metadata.Title;
        CoverHash = metadata.CoverHash;
        ReleaseYear = metadata.ReleaseYear;
        Rank = metadata.Rank;
        PreviewStatus = metadata.Preview;
        AlbumId = metadata.AlbumId;
        ReadAt = now;
    }

    /// <summary>Note que Deezer ne connaît pas ce morceau.</summary>
    public void RecordNotFound(DateTimeOffset now)
    {
        Status = CandidateStatus.NotFound;
        ReadAt = now;
    }

    /// <summary>Écarte le candidat, ou le remet (<paramref name="dismissed"/> faux).</summary>
    public void SetDismissed(bool dismissed, DateTimeOffset now) => DismissedAt = dismissed ? DismissedAt ?? now : null;

    /// <summary>Au-delà de ce délai, une demande d'ajout restée sans suite (le message a échoué, par exemple) est considérée comme perdue : le candidat peut être redemandé.</summary>
    public static readonly TimeSpan AddRequestTimeout = TimeSpan.FromMinutes(10);

    public void RequestAdd(DateTimeOffset now) => AddRequestedAt = now;

    /// <summary>L'ajout au pool est demandé, depuis moins de <see cref="AddRequestTimeout"/>, et pas encore fait.</summary>
    public bool IsAdding(DateTimeOffset now) => IsAddingAt(AddRequestedAt, now);

    public static bool IsAddingAt(DateTimeOffset? requestedAt, DateTimeOffset now) => requestedAt is { } at && now - at < AddRequestTimeout;

    /// <summary>Peut être ajouté au pool : lu, avec un extrait, ni écarté ni déjà en cours d'ajout.</summary>
    public bool CanBeAdded(DateTimeOffset now) => Status == CandidateStatus.Ready && PreviewStatus == PreviewStatus.Available && !IsDismissed && !IsAdding(now);

    /// <summary>Les informations du morceau, telles que le pool les garde (valable une fois le candidat lu).</summary>
    public TrackMetadata ToMetadata() =>
        new(DeezerTrackId, Artist ?? string.Empty, Title ?? string.Empty, CoverHash, ReleaseYear, Rank, PreviewStatus, AlbumId);
}
