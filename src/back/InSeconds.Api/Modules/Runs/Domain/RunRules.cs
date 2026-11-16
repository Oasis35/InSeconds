namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// La photo des règles de la Série au moment où son défi est créé, rangée en <c>jsonb</c> dans le défi : changer un réglage <c>Runs:</c> à chaud
/// ne modifie jamais un défi déjà créé. Les listes sont des tableaux (la photo n'est pas relue depuis le binder de configuration).
/// <para>
/// La Série n'a pas de fin fixée : le joueur joue des manches de <see cref="TracksPerRound"/> morceaux jusqu'à avoir perdu ses
/// <see cref="Lives"/> vies. L'écoute d'une manche suit l'échelle <see cref="ListenLadder"/> (10, 5, 3, 2, 1, 0,5 s : le dernier palier se
/// répète), et un morceau rapporte les points du palier de sa manche (<see cref="StepPoints"/>).
/// </para>
/// </summary>
/// <param name="Lives">Les vies au départ.</param>
/// <param name="TracksPerRound">Les morceaux d'une manche.</param>
/// <param name="ListenLadder">Les durées d'écoute, du palier le plus long (celui de la première manche) au plus court.</param>
/// <param name="StepPoints">Les points d'un morceau trouvé en entier à chaque palier (une valeur par palier de <see cref="ListenLadder"/>).</param>
/// <param name="AnswerSeconds">Le chrono d'un morceau, du premier son à la réponse (écoute et réécoutes comprises) ; 0 : pas de chrono.</param>
/// <param name="Themes">
/// Les thèmes des manches (jamais la première), figés dès que le premier joueur arrivé à une manche l'a choisi : pour chacune, le thème de la liste
/// de l'admin dont ses morceaux sont tirés, et son nom à ce moment-là. Tous les joueurs de la playlist jouent les mêmes morceaux, la comparaison reste
/// juste ; une manche qui n'y figure pas est tirée sans thème.
/// </param>
/// <param name="RankBands">En combien de tranches de notoriété le catalogue est coupé : la manche k tire dans la tranche k (la dernière se répète).</param>
public sealed record RunRules(
    int Lives, int TracksPerRound, IReadOnlyList<decimal> ListenLadder, IReadOnlyList<int> StepPoints, int AnswerSeconds = 0,
    IReadOnlyList<RunRoundTheme>? Themes = null, int RankBands = 8)
{
    /// <summary>Le thème de cette manche, vide si elle n'en a pas.</summary>
    public RunRoundTheme? ThemeOf(int round) => Themes?.FirstOrDefault(t => t.Round == round);

    /// <summary>Le morceau a un chrono.</summary>
    public bool HasClock => AnswerSeconds > 0;

    /// <summary>Le dernier palier de l'échelle : on n'écoute pas moins.</summary>
    public int LastStep => ListenLadder.Count - 1;

    /// <summary>La manche d'une position (de 1 à N) : les morceaux se jouent dans l'ordre, <see cref="TracksPerRound"/> par manche.</summary>
    public int RoundOf(int position)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(position, 1);
        return ((position - 1) / TracksPerRound) + 1;
    }

    /// <summary>La première position d'une manche.</summary>
    public int FirstPositionOf(int round)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(round, 1);
        return ((round - 1) * TracksPerRound) + 1;
    }

    /// <summary>L'écoute d'un morceau à ce palier (au-delà du dernier, le dernier).</summary>
    public decimal ListenAt(int step) => ListenLadder[Math.Clamp(step, 0, LastStep)];

    /// <summary>Les points d'un morceau trouvé en entier à ce palier.</summary>
    public int PointsAt(int step) => StepPoints[Math.Clamp(step, 0, LastStep)];
}

/// <summary>Le thème d'une manche à thème : la manche, le thème de la liste de l'admin et son nom quand il a été choisi.</summary>
public sealed record RunRoundTheme(int Round, int ThemeId, string Name);

/// <summary>
/// Ce que devient le palier d'une manche à l'autre. Une manche **sans erreur** (tous ses morceaux trouvés en entier) descend d'un palier (écoute plus
/// courte, points plus gros) ; une manche avec une **erreur** (une vie perdue) en remonte un, jamais au-dessus du premier ; une manche où l'on n'a fait
/// que des moitiés justes en plus du reste ne bouge pas. Une règle unique, la même à tous les paliers.
/// </summary>
public static class RunSteps
{
    public static int Next(int step, RoundTally tally, int lastStep)
    {
        if (tally.Failed > 0)
            return Math.Max(0, step - 1);
        return tally is { Half: 0, Full: > 0 } ? Math.Min(lastStep, step + 1) : step;
    }
}

/// <summary>Le compte des réponses d'une manche, morceaux neutralisés exclus (ils ne comptent pour rien).</summary>
/// <param name="Full">Artiste et titre justes.</param>
/// <param name="Half">Un seul des deux : la moitié des points, pas de vie perdue.</param>
/// <param name="Failed">Ni l'un ni l'autre, un morceau passé ou une réponse arrivée après le chrono : une vie perdue.</param>
public readonly record struct RoundTally(int Full, int Half, int Failed)
{
    public int Answered => Full + Half + Failed;
}
