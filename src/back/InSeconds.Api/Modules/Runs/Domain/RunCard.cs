using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Un coup de pouce (une carte), la valeur est stockée (colonne <c>card</c>). Dans une playlist « durable » (<see cref="RunCardRules.Durable"/>), une
/// carte agit tant qu'elle est en main, sauf le Joker, à usage unique ; dans une playlist plus ancienne, toutes se jouaient une fois sur un morceau.
/// </summary>
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

    /// <summary>« Genre » : le genre de l'album du morceau (le premier, par ordre alphabétique), affiché seul.</summary>
    Genre = 9,

    /// <summary>« L'un ou l'autre » : trouver l'artiste ou le titre suffit pour les points du morceau entier.</summary>
    EitherOr = 10,
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
        RunCard.Genre => "genre",
        RunCard.EitherOr => "either_or",
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
/// <param name="Durable">
/// Les cartes agissent tant qu'elles sont en main (sauf le Joker, à usage unique), sans clic, et aucune carte n'est offerte au départ ; faux pour une
/// playlist d'avant : ses cartes se jouent une fois sur un morceau.
/// </param>
/// <param name="ExtendBonusSeconds">Durable : les secondes que « Prolongation » ajoute à l'écoute d'un morceau.</param>
public sealed record RunCardRules(
    int HandSize, RunCard? StartCard, IReadOnlyList<RunCardOffer> Offers, decimal ExtendListenSeconds, int HourglassSeconds, int LowerTargetPercent,
    IReadOnlyList<RunCard> Pool, bool Durable = false, decimal ExtendBonusSeconds = 0m)
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

    /// <summary>
    /// Les règles des cartes complétées de la carte de départ et des offres de chaque palier, tirées dans <see cref="RunCardRules.Pool"/>. Le Joker
    /// n'est offert que pour une manche qui a des morceaux en réserve (<paramref name="roundsWithReserve"/> : la manche 1 pour la carte de départ,
    /// la manche r + 1 pour l'offre du palier r).
    /// </summary>
    public RunCardRules Deal(RunCardRules settings, RunRules rules, int seed, IReadOnlyCollection<int> roundsWithReserve)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(rules);
        ArgumentNullException.ThrowIfNull(roundsWithReserve);
        List<RunCard> PoolFor(int round) =>
            settings.Pool.Distinct().Where(c => c != RunCard.Joker || roundsWithReserve.Contains(round)).Order().ToList();

        // Une playlist durable ne donne rien au départ : la première manche se joue sans carte.
        var startPool = settings.Durable ? new List<RunCard>() : PoolFor(1);
        var start = startPool.Count == 0 ? (RunCard?)null : shuffle.Shuffle(startPool, unchecked(seed * 31 + 7))[0];
        var offers = Enumerable.Range(1, rules.Rounds - 1)
            .Select(round => new RunCardOffer(round, shuffle.Shuffle(PoolFor(round + 1), unchecked(seed * 31 + 7 + round)).Take(OfferSize).ToList()))
            .Where(offer => offer.Cards.Count > 0)
            .ToList();
        return settings with { StartCard = start, Offers = offers };
    }
}

/// <summary>
/// « Trois choix » : un morceau peut servir de leurre s'il est hors de la playlist (ni joué, ni en réserve) et d'un autre artiste que la bonne
/// réponse et que les leurres déjà retenus.
/// </summary>
public static class RunChoices
{
    /// <summary>Les leurres proposés à côté de la bonne réponse.</summary>
    public const int DecoyCount = 2;

    public static bool IsDecoy(string answerArtist, string candidateArtist, IEnumerable<string> chosenArtists) =>
        !string.Equals(candidateArtist, answerArtist, StringComparison.OrdinalIgnoreCase)
        && !chosenArtists.Any(a => string.Equals(a, candidateArtist, StringComparison.OrdinalIgnoreCase));
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
