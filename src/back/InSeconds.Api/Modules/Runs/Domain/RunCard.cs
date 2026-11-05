using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un coup de pouce (une carte) du proto 2, à usage unique (colonne <c>card</c> : la valeur est stockée).</summary>
public enum RunCard : short
{
    /// <summary>« Trois choix » : la saisie est remplacée par trois réponses, une seule est juste.</summary>
    ThreeChoices = 1,

    /// <summary>« Joker » : change de morceau (le suivant de la réserve de la manche).</summary>
    Joker = 2,

    /// <summary>« Année » : l'année du morceau.</summary>
    Year = 3,

    /// <summary>« Initiales » : les initiales de l'artiste et du titre.</summary>
    Initials = 4,

    /// <summary>« Rallonge » : une écoute plus longue (20 s au lieu de 10).</summary>
    Extend = 5,

    /// <summary>« Filet » : un morceau raté compte comme à moitié trouvé.</summary>
    Net = 6,

    /// <summary>« Seuil abaissé » : l'objectif de la manche baisse (20 %), pour toute la manche.</summary>
    LowerTarget = 7,

    /// <summary>« Sablier » : du temps en plus au chrono du morceau (30 s).</summary>
    Hourglass = 8,
}

/// <summary>Les noms des cartes dans l'API et les réglages, jamais un texte affiché (le front les traduit).</summary>
public static class RunCards
{
    public static readonly IReadOnlyList<RunCard> All = Enum.GetValues<RunCard>();

    public static string KeyOf(RunCard card) => card switch
    {
        RunCard.ThreeChoices => "three_choices",
        RunCard.Joker => "joker",
        RunCard.Year => "year",
        RunCard.Initials => "initials",
        RunCard.Extend => "extend",
        RunCard.Net => "net",
        RunCard.LowerTarget => "lower_target",
        RunCard.Hourglass => "hourglass",
        _ => throw new ArgumentOutOfRangeException(nameof(card)),
    };

    public static RunCard? Parse(string? key) => All.Select(c => (RunCard?)c).FirstOrDefault(c => KeyOf(c!.Value) == key);
}

/// <summary>Les trois cartes proposées au palier qui suit la manche <paramref name="AfterRound"/> (de 1 à l'avant-dernière).</summary>
public sealed record RunCardOffer(int AfterRound, IReadOnlyList<RunCard> Cards);

/// <summary>
/// Les coups de pouce d'une playlist, figés à sa création : la carte offerte au départ et les offres de chaque palier (les mêmes pour tous ses joueurs,
/// la comparaison reste juste), la taille de la main et les effets chiffrés.
/// </summary>
/// <param name="HandSize">Les emplacements de la main (2).</param>
/// <param name="StartCard">La carte en main au départ du run ; vide si aucune.</param>
/// <param name="Offers">Une offre par palier.</param>
/// <param name="ExtendListenSeconds">L'écoute d'un morceau sous « Rallonge ».</param>
/// <param name="HourglassSeconds">Les secondes ajoutées au chrono par « Sablier ».</param>
/// <param name="LowerTargetPercent">La baisse de l'objectif de la manche sous « Seuil abaissé », en pourcentage.</param>
/// <param name="Pool">Les cartes que la playlist pouvait tirer (les réglages du moment).</param>
public sealed record RunCardRules(
    int HandSize, RunCard? StartCard, IReadOnlyList<RunCardOffer> Offers, decimal ExtendListenSeconds, int HourglassSeconds, int LowerTargetPercent,
    IReadOnlyList<RunCard> Pool)
{
    /// <summary>L'offre du palier qui suit cette manche, vide s'il n'y en a pas.</summary>
    public IReadOnlyList<RunCard> OfferAfter(int round) => Offers.FirstOrDefault(o => o.AfterRound == round)?.Cards ?? [];
}

/// <summary>
/// Tire les coups de pouce d'une playlist : la carte de départ, puis trois cartes distinctes par palier, dans les cartes permises, au hasard de la
/// graine de la playlist (tirage reproductible). Le Joker n'est jamais tiré sans réserve de morceaux à jouer.
/// </summary>
public sealed class RunCardDealer(ISeededShuffle shuffle)
{
    /// <summary>Les cartes d'une offre.</summary>
    public const int OfferSize = 3;

    /// <summary>Les règles des cartes complétées de la carte de départ et des offres de chaque palier, tirées dans <see cref="RunCardRules.Pool"/>.</summary>
    public RunCardRules Deal(RunCardRules settings, RunRules rules, int seed)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(rules);
        var pool = settings.Pool.Distinct().Where(c => c != RunCard.Joker || rules.ReservePerRound > 0).Order().ToList();
        if (pool.Count == 0)
            return settings with { StartCard = null, Offers = [] };

        var start = shuffle.Shuffle(pool, unchecked(seed * 31 + 7))[0];
        var offers = Enumerable.Range(1, rules.Rounds - 1)
            .Select(round => new RunCardOffer(round, shuffle.Shuffle(pool, unchecked(seed * 31 + 7 + round)).Take(OfferSize).ToList()))
            .ToList();
        return settings with { StartCard = start, Offers = offers };
    }
}

/// <summary>Les initiales d'un nom : la première lettre ou le premier chiffre de chaque mot, en capitale.</summary>
public static class RunInitials
{
    public static IReadOnlyList<string> Of(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        return text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)
            .Select(word => word.FirstOrDefault(char.IsLetterOrDigit))
            .Where(c => c != default)
            .Select(c => char.ToUpperInvariant(c).ToString())
            .ToList();
    }
}
