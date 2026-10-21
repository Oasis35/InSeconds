namespace InSeconds.Api.Modules.Catalogue.Contracts;

/// <summary>
/// Ce qu'un morceau doit à l'usage qu'en fait un mode de jeu : la dernière apparition dans un défi, le nombre
/// d'apparitions, le jour où il redevient tirable, et sa présence dans le défi du jour.
/// </summary>
/// <param name="UnlockDate">Premier jour où il redevient tirable (<c>LastUsedDate</c> + cooldown + 1, le cooldown se déduisant de la taille du
/// pool), vide s'il n'a jamais servi.</param>
/// <param name="UsedByMode">Le mode le déclare utilisé **sans** que cet usage compte pour le cooldown ni pour les dates : un mode dont les
/// parties référencent le morceau (une clé étrangère) mais qui n'a pas de cooldown (Runs) répond ainsi, tout le reste à « aucun ».</param>
public sealed record TrackUsage(DateOnly? LastUsedDate, int UsageCount, DateOnly? UnlockDate, bool InTodayChallenge, bool UsedByMode = false)
{
    /// <summary>Jamais utilisé.</summary>
    public static readonly TrackUsage None = new(null, 0, null, false);

    /// <summary>Déjà dans un défi (de n'importe quel mode) : ni suppression ni actualisation.</summary>
    public bool IsUsed => UsageCount > 0 || UsedByMode;

    /// <summary>
    /// L'usage de deux modes réunis : la date la plus récente, la somme des apparitions, présent dans le défi du jour si l'un des deux l'est,
    /// utilisé si l'un des deux le dit. Un mode qui n'a pas de cooldown répond « aucun » pour les dates, elles restent donc celles du Daily.
    /// </summary>
    public TrackUsage CombinedWith(TrackUsage other)
    {
        ArgumentNullException.ThrowIfNull(other);
        return new TrackUsage(
            Latest(LastUsedDate, other.LastUsedDate), UsageCount + other.UsageCount, Latest(UnlockDate, other.UnlockDate),
            InTodayChallenge || other.InTodayChallenge, UsedByMode || other.UsedByMode);
    }

    private static DateOnly? Latest(DateOnly? a, DateOnly? b) => a is null ? b : b is null ? a : a > b ? a : b;
}

/// <summary>
/// L'usage des morceaux **par un mode** : chaque mode (Daily, plus tard Runs) en fournit une implémentation et l'**ajoute** au conteneur (jamais
/// de remplacement : <c>services.AddScoped&lt;ITrackUsage, …&gt;()</c>), Catalogue ne connaissant aucun mode. Les consommateurs de Catalogue ne
/// l'injectent pas directement (ils recevraient celui du dernier mode enregistré) : ils passent par <see cref="ITrackPoolUsage"/>, qui les réunit.
/// </summary>
public interface ITrackUsage
{
    /// <summary>Le nom du mode (<c>daily</c>), stable : l'admin en fait une pastille et un onglet.</summary>
    string Mode { get; }

    /// <summary>L'usage de ces morceaux ; un morceau absent du résultat n'a jamais servi (<see cref="TrackUsage.None"/>).</summary>
    Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct);
}

/// <summary>
/// L'usage des morceaux **tous modes confondus**, tel que Catalogue le lit pour le pool de l'admin et pour décider qu'un morceau ne peut plus être
/// supprimé ni actualisé (409 <c>catalogue.track_in_use</c>) : il l'est dès qu'un seul mode l'a utilisé. Réunit les <see cref="ITrackUsage"/> de
/// chaque mode (<see cref="TrackUsage.CombinedWith"/>) ; sans aucun mode, rien n'a jamais servi. Le cooldown n'y figure pas : c'est une règle du
/// Daily seul (<c>IDailyTrackUsage</c>).
/// </summary>
public interface ITrackPoolUsage
{
    Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct);

    /// <summary>L'usage de ces morceaux **mode par mode** (pour l'admin) : seuls les modes qui ont quelque chose à dire d'un morceau y figurent.</summary>
    Task<IReadOnlyDictionary<int, IReadOnlyList<ModeUsage>>> GetByModeAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct);
}

/// <summary>Ce qu'un mode dit de l'usage d'un morceau.</summary>
public sealed record ModeUsage(string Mode, TrackUsage Usage);
