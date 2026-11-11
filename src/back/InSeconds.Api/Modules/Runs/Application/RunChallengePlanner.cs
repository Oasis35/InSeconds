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
    ITrackDirectory tracks, IRunTrackSelector selector, RunCardDealer dealer, IRunsStore store, RunsRules rules,
    TimeProvider time)
{
    /// <summary>Combien de codes essayer avant de renoncer (une collision répétée n'est plus de la malchance).</summary>
    private const int MaxCodeAttempts = 5;

    private async Task<List<RankedTrack>> CandidatesAsync(CancellationToken ct)
    {
        var playable = await tracks.ListPlayableIdsAsync(ct);
        var infos = playable.Count == 0 ? new Dictionary<int, TrackInfo>() : await tracks.GetAsync(playable, ct);
        return [.. playable.Select(id => new RankedTrack(id, infos.GetValueOrDefault(id)?.DeezerRank, infos.GetValueOrDefault(id)?.ThemeIds))];
    }

    public async Task<PlanResult> PlanAsync(Guid? createdBy, CancellationToken ct)
    {
        var current = rules.Current();
        var candidates = await CandidatesAsync(ct);

        var seed = System.Security.Cryptography.RandomNumberGenerator.GetInt32(int.MaxValue);
        // La manche à thème : tirée avec la playlist parmi les manches permises, ou aucune. Son thème n'est pas choisi ici : le créateur le choisit juste
        // avant de la commencer (RunThemeDealer), ses morceaux sont alors tirés dans ce thème. Rien à proposer sans trois thèmes assez fournis.
        current = current with { PendingThemeRound = await DrawThemedRoundAsync(current, candidates, seed, ct) };
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

    // Une chance sur (manches permises + 1) pour chaque cas : la manche à thème est l'une des manches permises, ou il n'y en a pas.
    private async Task<int?> DrawThemedRoundAsync(RunRules current, IReadOnlyList<RankedTrack> candidates, int seed, CancellationToken ct)
    {
        var themedRounds = rules.ThemedRounds().Where(r => r >= 2 && r <= current.Rounds).Order().ToList();
        if (themedRounds.Count == 0)
            return null;
        var names = await tracks.ListThemesAsync(ct);
        var eligible = RunThemes.Eligible(candidates.Select(c => c.ThemeIds), current).Count(names.ContainsKey);
        if (eligible < RunThemes.MinEligibleThemes)
            return null;
        var pick = (int)((seed + 4242L) % (themedRounds.Count + 1));
        return pick < themedRounds.Count ? themedRounds[pick] : null;
    }
}
