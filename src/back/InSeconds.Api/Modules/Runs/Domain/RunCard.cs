using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Un coup de pouce, la valeur est stockée (colonne <c>card</c>). Trois cartes se gagnent (une manche franchie bien au-dessus de son objectif en offre
/// une pour la manche suivante, <see cref="RunCardRules"/>), et « Échange » (<see cref="Swap"/>) s'offre à chaque manche sans se gagner : il n'est
/// jamais en main, ses lignes de <c>session_cards</c> notent les échanges faits. Les anciennes valeurs (initiales, repêchage, rabais, délai, genre,
/// « l'un ou l'autre ») n'existent plus : une ancienne partie les garde en base jusqu'à la purge, sans effet.
/// </summary>
public enum RunCard : short
{
    /// <summary>« QCM » : la saisie est remplacée par trois réponses, une seule est juste.</summary>
    ThreeChoices = 1,

    /// <summary>« Échange » : change de morceau (le suivant de la réserve de la manche). Un par manche, non cumulable ; jamais une carte en main.</summary>
    Swap = 2,

    /// <summary>« Indice » : l'année, le genre de l'album (s'il est connu) et les initiales de l'artiste et du titre.</summary>
    Hint = 3,

    /// <summary>« Prolongation » : une écoute plus longue (5 s de plus).</summary>
    Extend = 5,
}

/// <summary>Les noms des cartes dans l'API et les réglages, jamais un texte affiché (le front les traduit).</summary>
public static class RunCards
{
    /// <summary>Les cartes qui se gagnent (« Échange » ne s'offre pas : il revient à chaque manche).</summary>
    public static readonly IReadOnlyList<RunCard> Earnable = [RunCard.ThreeChoices, RunCard.Hint, RunCard.Extend];

    /// <summary>Le nom d'une ancienne carte (valeur retirée du jeu, lue dans une ancienne partie).</summary>
    public const string RetiredKey = "retired";

    public static string KeyOf(RunCard card) => card switch
    {
        RunCard.ThreeChoices => "three_choices",
        RunCard.Swap => "swap",
        RunCard.Hint => "hint",
        RunCard.Extend => "extend",
        _ => RetiredKey,
    };

    public static RunCard? Parse(string? key) => Earnable.Select(c => (RunCard?)c).FirstOrDefault(c => KeyOf(c!.Value) == key);
}

/// <summary>La carte offerte à qui franchit la manche <paramref name="AfterRound"/> (de 1 à l'avant-dernière) bien au-dessus de son objectif.</summary>
public sealed record RunCardReward(int AfterRound, RunCard Card);

/// <summary>
/// Les coups de pouce d'une playlist, figés à sa création (les mêmes pour tous ses joueurs, la comparaison reste juste).
/// </summary>
/// <param name="Pool">Les cartes que la playlist pouvait tirer (les réglages du moment).</param>
/// <param name="Rewards">La carte offerte après chaque manche, tirée dans <paramref name="Pool"/> à la graine de la playlist ; vide d'abord.</param>
/// <param name="RewardMarginPercent">
/// De combien l'objectif de la manche doit être dépassé pour gagner la carte (25 : à 125 % de l'objectif).
/// </param>
/// <param name="ExtendBonusSeconds">Les secondes que « Prolongation » ajoute à l'écoute d'un morceau.</param>
public sealed record RunCardRules(
    IReadOnlyList<RunCard> Pool, IReadOnlyList<RunCardReward>? Rewards = null, int RewardMarginPercent = 25, decimal ExtendBonusSeconds = 0m)
{
    /// <summary>La carte que gagne la manche <paramref name="round"/>, vide s'il n'y en a pas.</summary>
    public RunCard? RewardAfter(int round) => Rewards?.FirstOrDefault(r => r.AfterRound == round)?.Card;

    /// <summary>Le score de la manche gagne la carte : il dépasse l'objectif d'au moins <see cref="RewardMarginPercent"/> % (jamais sans objectif).</summary>
    public bool Earns(int score, int objective) => objective > 0 && (long)score * 100 >= (long)objective * (100 + RewardMarginPercent);
}

/// <summary>
/// Tire la carte gagnée après chaque manche d'une playlist, dans les cartes permises, au hasard de la graine de la playlist (tirage reproductible).
/// </summary>
public sealed class RunCardDealer(ISeededShuffle shuffle)
{
    /// <summary>Les règles des cartes complétées de la carte que chaque manche (sauf la dernière) peut offrir, tirée dans <see cref="RunCardRules.Pool"/>.</summary>
    public RunCardRules Deal(RunCardRules settings, RunRules rules, int seed)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(rules);
        var pool = settings.Pool.Distinct().Order().ToList();
        if (pool.Count == 0)
            return settings with { Rewards = [] };
        var rewards = Enumerable.Range(1, rules.Rounds - 1)
            .Select(round => new RunCardReward(round, shuffle.Shuffle(pool, unchecked(seed * 31 + 7 + round))[0]))
            .ToList();
        return settings with { Rewards = rewards };
    }
}

/// <summary>
/// « QCM » : un morceau peut servir de leurre s'il est hors de la playlist (ni joué, ni en réserve) et d'un autre artiste que la bonne
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
