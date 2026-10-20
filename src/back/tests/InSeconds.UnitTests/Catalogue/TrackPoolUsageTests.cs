using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;

namespace InSeconds.UnitTests.Catalogue;

/// <summary>
/// L'usage des morceaux tous modes confondus (P1 du mode Run) : Catalogue réunit l'<see cref="ITrackUsage"/> de chaque mode. Un morceau est « utilisé »
/// dès qu'un seul mode le dit ; les dates et le défi du jour restent ceux du mode qui en a (un mode sans cooldown répond « aucun »).
/// </summary>
public class TrackPoolUsageTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly DateOnly Sept20 = new(2026, 9, 20);
    private static readonly DateOnly Oct20 = new(2026, 10, 20);

    private static TrackUsage DailyUsage(int count = 2, bool today = false) => new(Sept20, count, Oct20, today);

    private static readonly TrackUsage RunsOnly = TrackUsage.None with { UsedByMode = true };

    private static Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IEnumerable<ITrackUsage> modes, params int[] ids) =>
        new TrackPoolUsage(modes).GetAsync(ids, Ct);

    [Fact]
    public async Task SansAucunMode_RienNAJamaisServi() =>
        Assert.Empty(await GetAsync([], 1, 2));

    [Fact]
    public async Task UnSeulMode_SesReponsesTellesQuelles()
    {
        var usages = await GetAsync([new FakeMode { [1] = DailyUsage() }], 1, 2);

        var one = Assert.Single(usages);
        Assert.Equal((1, DailyUsage()), (one.Key, one.Value));
    }

    [Fact]
    public async Task DeuxModes_UnMorceauUtiliseParLUnSeul_EstUtilise_LesDatesRestentCellesDuModeQuiLesDonne()
    {
        var usages = await GetAsync([new FakeMode { [1] = DailyUsage(count: 3, today: true) }, new FakeMode { [1] = RunsOnly, [2] = RunsOnly }], 1, 2, 3);

        // Le morceau 1 : joué au Daily (3 fois, dans le défi du jour), et déclaré utilisé par l'autre mode, qui n'ajoute ni date ni apparition.
        Assert.Equal(new TrackUsage(Sept20, 3, Oct20, InTodayChallenge: true, UsedByMode: true), usages[1]);
        Assert.True(usages[1].IsUsed);
        // Le morceau 2 : joué seulement par l'autre mode : utilisé, bien qu'aucune apparition ne soit comptée, et sans date.
        Assert.Equal(0, usages[2].UsageCount);
        Assert.Null(usages[2].LastUsedDate);
        Assert.True(usages[2].IsUsed);
        // Le morceau 3 : aucun mode n'en parle.
        Assert.DoesNotContain(3, usages.Keys);
    }

    [Fact]
    public async Task DeuxModesQuiOntLeurPropreUsage_LesApparitionsSAdditionnent_LaDateLaPlusRecenteGagne()
    {
        var usages = await GetAsync(
            [new FakeMode { [1] = new TrackUsage(Sept20, 2, Oct20, false) }, new FakeMode { [1] = new TrackUsage(new DateOnly(2026, 10, 1), 1, new DateOnly(2026, 11, 1), false) }], 1);

        Assert.Equal(new TrackUsage(new DateOnly(2026, 10, 1), 3, new DateOnly(2026, 11, 1), InTodayChallenge: false), usages[1]);
    }

    [Fact]
    public async Task LOrdreDesModes_NeChangePasLeResultat()
    {
        var daily = new FakeMode { [1] = DailyUsage() };
        var runs = new FakeMode { [1] = RunsOnly };

        Assert.Equal(await GetAsync([daily, runs], 1), await GetAsync([runs, daily], 1));
    }

    [Fact]
    public async Task ChaqueModeEstInterrogeSurLesMemesIdentifiants()
    {
        var first = new FakeMode();
        var second = new FakeMode();

        await GetAsync([first, second], 4, 5);

        Assert.Equal([[4, 5]], first.Asked);
        Assert.Equal([[4, 5]], second.Asked);
    }

    [Fact]
    public void Jamais_UtiliseNEstPasUtilise() => Assert.False(TrackUsage.None.IsUsed);

    [Fact]
    public void UneApparition_OuUneDeclaration_SuffitPourEtreUtilise()
    {
        Assert.True(DailyUsage(count: 1).IsUsed);
        Assert.True(RunsOnly.IsUsed);
    }

    [Fact]
    public void CombinedWith_UnDateAbsenteLaisseCelleDeLAutre()
    {
        var combined = TrackUsage.None.CombinedWith(DailyUsage());

        Assert.Equal(DailyUsage(), combined);
        Assert.Equal(DailyUsage(), DailyUsage().CombinedWith(TrackUsage.None));
    }

    /// <summary>Un mode de jeu : répond ce qu'on lui a dit, et note ce qu'on lui a demandé.</summary>
    private sealed class FakeMode : ITrackUsage
    {
        private readonly Dictionary<int, TrackUsage> _usages = [];

        public List<int[]> Asked { get; } = [];

        public TrackUsage this[int trackId]
        {
            set => _usages[trackId] = value;
        }

        public Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
        {
            Asked.Add([.. trackIds]);
            return Task.FromResult<IReadOnlyDictionary<int, TrackUsage>>(trackIds.Where(_usages.ContainsKey).ToDictionary(id => id, id => _usages[id]));
        }
    }
}
