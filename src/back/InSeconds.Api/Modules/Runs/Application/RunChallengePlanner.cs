using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Ce qu'un tirage de défi a donné.</summary>
/// <param name="Challenge">Le défi à enregistrer ; vide si le pool est insuffisant.</param>
public sealed record PlanResult(RunChallenge? Challenge, int EligibleCount, int Requested);

/// <summary>
/// Crée le défi d'un run : règles figées depuis les réglages du moment, graine et code tirés au hasard (jamais exposée, la graine), morceaux choisis
/// parmi **tout le catalogue jouable** (Daily compris). La route qui lance un run (la partie) l'appelle ; le défi n'est pas enregistré ici.
/// Le code est vérifié avant l'insertion (pas de réessai dans la transaction Wolverine) : 31⁶ codes, une collision est très rare, et l'index unique
/// reste le garde-fou.
/// </summary>
public sealed class RunChallengePlanner(
    ITrackDirectory tracks, IRunTrackSelector selector, ISeededShuffle shuffle, RunCardDealer dealer, IRunsStore store, RunsRules rules,
    TimeProvider time)
{
    /// <summary>Combien de codes essayer avant de renoncer (une collision répétée n'est plus de la malchance).</summary>
    private const int MaxCodeAttempts = 5;

    /// <summary>Combien de thèmes le créateur se voit proposer au lancement (plus « Surprise »).</summary>
    public const int OfferedThemes = 2;

    /// <summary>
    /// Les thèmes proposés au créateur : deux tirés au hasard parmi ceux qui ont assez de morceaux pour une manche et sa réserve ; vide s'il n'y a
    /// pas de manche à thème ou pas de thème assez fourni.
    /// </summary>
    public async Task<IReadOnlyList<RunRoundTheme>> OfferThemesAsync(CancellationToken ct)
    {
        var current = rules.Current();
        var themedRounds = rules.ThemedRounds().Where(r => r >= 2 && r <= current.Rounds).Order().ToList();
        if (themedRounds.Count == 0)
            return [];
        var candidates = await CandidatesAsync(ct);
        var names = await tracks.ListThemesAsync(ct);
        var eligible = RunThemes.Eligible(candidates.Select(c => c.ThemeIds), current).Where(names.ContainsKey).ToList();
        var seed = System.Security.Cryptography.RandomNumberGenerator.GetInt32(int.MaxValue);
        return [.. shuffle.Shuffle(eligible, seed).Take(OfferedThemes).Select(id => new RunRoundTheme(themedRounds[0], id, names[id]))];
    }

    private async Task<List<RankedTrack>> CandidatesAsync(CancellationToken ct)
    {
        var playable = await tracks.ListPlayableIdsAsync(ct);
        var infos = playable.Count == 0 ? new Dictionary<int, TrackInfo>() : await tracks.GetAsync(playable, ct);
        return [.. playable.Select(id => new RankedTrack(id, infos.GetValueOrDefault(id)?.DeezerRank, infos.GetValueOrDefault(id)?.ThemeIds))];
    }

    /// <param name="themeId">Le thème choisi par le créateur pour la première manche à thème ; vide : « Surprise » (tirage). Un thème inconnu ou
    /// trop peu fourni est ignoré.</param>
    public async Task<PlanResult> PlanAsync(Guid? createdBy, int? themeId, CancellationToken ct)
    {
        var current = rules.Current();
        var candidates = await CandidatesAsync(ct);

        var seed = System.Security.Cryptography.RandomNumberGenerator.GetInt32(int.MaxValue);
        // Les manches à thème : un thème de la liste de l'admin par manche, tiré avec la graine parmi ceux qui ont assez de morceaux.
        var names = await tracks.ListThemesAsync(ct);
        current = current with { Themes = await DrawThemesAsync(current, candidates, names, seed, themeId) };
        var selection = selector.Select(candidates, current, seed);
        if (!selection.IsSufficient)
            return new PlanResult(null, selection.EligibleCount, selection.Requested);
        // Les coups de pouce : la carte de départ et les offres de chaque palier, les mêmes pour tous les joueurs de la playlist.
        if (current.Cards is { } cards)
            current = current with { Cards = dealer.Deal(cards, current, seed) };

        for (var attempt = 0; attempt < MaxCodeAttempts; attempt++)
        {
            var code = RunChallengeCode.Generate();
            if (await store.CodeExistsAsync(code, ct))
                continue;
            return new PlanResult(
                RunChallenge.Create(code, seed, current, selection.Tracks, createdBy, time.GetUtcNow(), selection.Reserve),
                selection.EligibleCount, selection.Requested);
        }

        throw new InvalidOperationException("Impossible de trouver un code de défi libre.");
    }

    // Les thèmes, un par manche à thème, tirés au hasard (graine de la playlist) parmi ceux qui ont assez de morceaux (la manche et sa réserve) ;
    // quand il y en a moins que de manches à thème, les dernières manches suivent leur tranche.
    private Task<IReadOnlyList<RunRoundTheme>?> DrawThemesAsync(
        RunRules current, IReadOnlyList<RankedTrack> candidates, IReadOnlyDictionary<int, string> names, int seed, int? chosen)
    {
        var themedRounds = rules.ThemedRounds().Where(r => r >= 2 && r <= current.Rounds).Order().ToList();
        var eligible = RunThemes.Eligible(candidates.Select(c => c.ThemeIds), current).Where(names.ContainsKey).ToList();
        var shuffled = shuffle.Shuffle(eligible, seed).ToList();
        // Le thème choisi prend la première manche à thème (s'il est valable), les autres manches tirent au hasard.
        if (chosen is { } c && eligible.Contains(c))
        {
            shuffled.Remove(c);
            shuffled.Insert(0, c);
        }
        var drawn = shuffled.Take(themedRounds.Count).ToList();
        IReadOnlyList<RunRoundTheme>? result = drawn.Count == 0
            ? null
            : [.. drawn.Select((id, i) => new RunRoundTheme(themedRounds[i], id, names[id]))];
        return Task.FromResult(result);
    }
}
