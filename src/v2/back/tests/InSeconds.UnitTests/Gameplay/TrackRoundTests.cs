using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;

namespace InSeconds.UnitTests.Gameplay;

/// <summary>La manche : plancher d'écoute, indices, réponse. Le piège 35 et les règles d'indices de la v1.</summary>
public class TrackRoundTests
{
    private static readonly HintPolicy DefaultPolicy = new([5m, 10m]);
    private static readonly TrackNames Daft = new("Daft Punk", "Get Lucky (feat. Pharrell Williams)");
    private static readonly IAnswerMatcher Matcher = new FuzzyAnswerMatcher();

    // --- écouter : le plancher garde le maximum ---

    [Fact]
    public void Start_NAPasEncoreRienEcoute()
    {
        Assert.Equal(0m, TrackRound.Start.ListenedSeconds);
        Assert.Equal(0, TrackRound.Start.HintLevel);
    }

    [Fact]
    public void Listen_PremiereEcoute_PoseLePlancher() =>
        Assert.Equal(1.5m, TrackRound.Start.Listen(1.5m).ListenedSeconds);

    [Fact]
    public void Listen_PlusLongue_RelevePlancher() =>
        Assert.Equal(3m, TrackRound.Start.Listen(1m).Listen(3m).ListenedSeconds);

    [Fact]
    public void Listen_PlusCourte_NeReduitJamaisLePlancher() =>
        Assert.Equal(5m, TrackRound.Start.Listen(5m).Listen(2m).ListenedSeconds);

    [Fact]
    public void Listen_MemeDuree_ChangeRien()
    {
        var round = TrackRound.Start.Listen(3m);

        Assert.Same(round, round.Listen(3m));
    }

    [Fact]
    public void Listen_NeModifiePasLaMancheDOrigine()
    {
        var before = TrackRound.Start.Listen(1m);

        before.Listen(10m);

        Assert.Equal(1m, before.ListenedSeconds);
    }

    [Fact]
    public void Listen_GardeLeNiveauDIndice()
    {
        var round = TrackRound.Start.Listen(10m).RevealHint(2, DefaultPolicy).Round!;

        Assert.Equal(2, round.Listen(10m).HintLevel);
        Assert.Equal(2, TrackRound.Resume(10m, 2).Listen(12m).HintLevel);
    }

    [Fact]
    public void Listen_DureeNegative_Refusee() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackRound.Start.Listen(-0.5m));

    // --- reprise d'une manche enregistrée ---

    [Fact]
    public void Resume_RedonneLEtatEnregistre()
    {
        var round = TrackRound.Resume(3m, 1);

        Assert.Equal(3m, round.ListenedSeconds);
        Assert.Equal(1, round.HintLevel);
    }

    [Fact]
    public void Resume_ValeursNegatives_Refusees()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackRound.Resume(-1m, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackRound.Resume(0m, -1));
    }

    [Fact]
    public void DeuxManchesDeMemeEtat_SontEgales() =>
        Assert.Equal(TrackRound.Resume(5m, 1), TrackRound.Start.Listen(5m).RevealHint(1, DefaultPolicy).Round);

    // --- indices ---

    [Fact]
    public void RevealHint_SeuilAtteint_Accepte()
    {
        var reveal = TrackRound.Start.Listen(5m).RevealHint(1, DefaultPolicy);

        Assert.True(reveal.IsAccepted);
        Assert.Equal(1, reveal.Round!.HintLevel);
        Assert.Null(reveal.Refusal);
    }

    [Fact]
    public void RevealHint_SeuilDepasse_Accepte() =>
        Assert.True(TrackRound.Start.Listen(7m).RevealHint(1, DefaultPolicy).IsAccepted);

    [Fact]
    public void RevealHint_SeuilPasAtteint_RefuseAvecLeSeuil()
    {
        var reveal = TrackRound.Start.Listen(4.5m).RevealHint(1, DefaultPolicy);

        Assert.False(reveal.IsAccepted);
        Assert.Equal(HintRefusal.NotUnlocked, reveal.Refusal);
        Assert.Equal(5m, reveal.UnlocksAtSeconds);
        Assert.Null(reveal.Round);
    }

    [Fact]
    public void RevealHint_SansEcoute_Refuse() =>
        Assert.Equal(HintRefusal.NotUnlocked, TrackRound.Start.RevealHint(1, DefaultPolicy).Refusal);

    [Fact]
    public void RevealHint_NiveauDeuxExigeSonPropreSeuil()
    {
        var round = TrackRound.Start.Listen(5m);

        Assert.True(round.RevealHint(1, DefaultPolicy).IsAccepted);
        var level2 = round.RevealHint(2, DefaultPolicy);
        Assert.Equal(HintRefusal.NotUnlocked, level2.Refusal);
        Assert.Equal(10m, level2.UnlocksAtSeconds);
        Assert.True(round.Listen(10m).RevealHint(2, DefaultPolicy).IsAccepted);
    }

    [Fact]
    public void RevealHint_DemanderDirectementLeNiveauDeux_SansAvoirPrisLUn_Accepte() =>
        Assert.Equal(2, TrackRound.Start.Listen(10m).RevealHint(2, DefaultPolicy).Round!.HintLevel);

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(3)]
    public void RevealHint_NiveauQueLeModeNeProposePas_Refuse(int level)
    {
        var reveal = TrackRound.Start.Listen(60m).RevealHint(level, DefaultPolicy);

        Assert.Equal(HintRefusal.UnknownLevel, reveal.Refusal);
        Assert.Null(reveal.UnlocksAtSeconds);
    }

    [Fact]
    public void RevealHint_ModeSansIndice_Refuse() =>
        Assert.Equal(HintRefusal.UnknownLevel, TrackRound.Start.Listen(60m).RevealHint(1, HintPolicy.None).Refusal);

    [Fact]
    public void RevealHint_GardeLeNiveauLePlusHaut_NeRedescendJamais()
    {
        var round = TrackRound.Start.Listen(10m).RevealHint(2, DefaultPolicy).Round!;

        var again = round.RevealHint(1, DefaultPolicy);

        Assert.True(again.IsAccepted);
        Assert.Equal(2, again.Round!.HintLevel);
    }

    [Fact]
    public void RevealHint_NeModifiePasLaDureeEcoutee()
    {
        var round = TrackRound.Start.Listen(7m).RevealHint(1, DefaultPolicy).Round!;

        Assert.Equal(7m, round.ListenedSeconds);
    }

    [Fact]
    public void RevealHint_PolitiqueAbsente_Leve() =>
        Assert.Throws<ArgumentNullException>(() => TrackRound.Start.RevealHint(1, null!));

    // --- répondre : le plancher ---

    [Fact]
    public void Answer_PalierSousLePlancher_Refuse()
    {
        var round = TrackRound.Start.Listen(5m);

        var result = round.Answer(2m, "Daft Punk", "Get Lucky", Daft, Matcher);

        Assert.False(result.IsAccepted);
        Assert.Equal(5m, result.FloorSeconds);
        Assert.Null(result.Outcome);
    }

    [Fact]
    public void Answer_PalierEgalAuPlancher_Accepte() =>
        Assert.True(TrackRound.Start.Listen(5m).Answer(5m, "Daft Punk", "Get Lucky", Daft, Matcher).IsAccepted);

    [Fact]
    public void Answer_PalierAuDessusDuPlancher_Accepte() =>
        Assert.True(TrackRound.Start.Listen(2m).Answer(5m, "Daft Punk", "Get Lucky", Daft, Matcher).IsAccepted);

    [Fact]
    public void Answer_MorceauSansExtrait_PalierZero_NAPasDePlancher()
    {
        var result = TrackRound.Start.Answer(0m, null, null, Daft, Matcher);

        Assert.True(result.IsAccepted);
        Assert.False(result.Outcome!.FoundAny);
    }

    [Fact]
    public void Answer_PalierNegatif_Refuse() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackRound.Start.Answer(-1m, "a", "b", Daft, Matcher));

    // --- répondre : la correction ---

    [Fact]
    public void Answer_ArtisteEtTitreJustes_LesDeuxTrouves()
    {
        var outcome = TrackRound.Start.Answer(1m, "daft punk", "get lucky", Daft, Matcher).Outcome!;

        Assert.True(outcome.ArtistCorrect);
        Assert.True(outcome.TitleCorrect);
        Assert.True(outcome.FoundBoth);
        Assert.True(outcome.FoundAny);
    }

    [Fact]
    public void Answer_SeulLArtisteJuste_ScorePartiel()
    {
        var outcome = TrackRound.Start.Answer(1m, "Daft Punk", "Autre chose", Daft, Matcher).Outcome!;

        Assert.True(outcome.ArtistCorrect);
        Assert.False(outcome.TitleCorrect);
        Assert.False(outcome.FoundBoth);
        Assert.True(outcome.FoundAny);
    }

    [Fact]
    public void Answer_SeulLeTitreJuste_ScorePartiel()
    {
        var outcome = TrackRound.Start.Answer(1m, "Quelqu'un d'autre", "Get Lucky", Daft, Matcher).Outcome!;

        Assert.False(outcome.ArtistCorrect);
        Assert.True(outcome.TitleCorrect);
        Assert.True(outcome.FoundAny);
    }

    [Fact]
    public void Answer_RienDeJuste_PasTrouve()
    {
        var outcome = TrackRound.Start.Answer(3m, "Coldplay", "Yellow", Daft, Matcher).Outcome!;

        Assert.False(outcome.FoundAny);
        Assert.False(outcome.FoundBoth);
    }

    [Fact]
    public void Answer_LeTitreDeReferenceGardeSesParentheses_LaSaisieSansLesParenthesesLEgale() =>
        Assert.True(TrackRound.Start.Answer(1m, "Daft Punk", "Get Lucky", Daft, Matcher).Outcome!.TitleCorrect);

    [Fact]
    public void Answer_RendLePalierAnnonce_PasLePlancher()
    {
        var outcome = TrackRound.Start.Listen(2m).Answer(5m, "Daft Punk", "Get Lucky", Daft, Matcher).Outcome!;

        Assert.Equal(5m, outcome.ListenedSeconds);
    }

    [Fact]
    public void Answer_RendLeNiveauDIndiceRevele()
    {
        var round = TrackRound.Start.Listen(10m).RevealHint(2, DefaultPolicy).Round!;

        var outcome = round.Answer(10m, "Daft Punk", "Get Lucky", Daft, Matcher).Outcome!;

        Assert.Equal(2, outcome.HintLevelUsed);
    }

    [Fact]
    public void Answer_SansIndice_NiveauZero() =>
        Assert.Equal(0, TrackRound.Start.Listen(1m).Answer(1m, "x", "y", Daft, Matcher).Outcome!.HintLevelUsed);

    [Fact]
    public void Answer_ChangeRien_LaMancheResteReutilisable()
    {
        var round = TrackRound.Start.Listen(3m);

        round.Answer(3m, "Daft Punk", "Get Lucky", Daft, Matcher);

        Assert.Equal(TrackRound.Resume(3m, 0), round);
    }

    [Fact]
    public void Answer_CorrecteurEtReferenceAbsents_Leve()
    {
        Assert.Throws<ArgumentNullException>(() => TrackRound.Start.Answer(1m, "a", "b", null!, Matcher));
        Assert.Throws<ArgumentNullException>(() => TrackRound.Start.Answer(1m, "a", "b", Daft, null!));
    }

    // --- les règles de la v1 : écouter plus ne coûte rien et ne remet rien à zéro ---

    [Fact]
    public void Parcours_ProlongerLEcouteApresUnIndice_GardeLIndice()
    {
        var round = TrackRound.Start.Listen(0.5m).Listen(5m);
        round = round.RevealHint(1, DefaultPolicy).Round!;
        round = round.Listen(10m);

        Assert.Equal(1, round.HintLevel);
        Assert.Equal(10m, round.ListenedSeconds);
        var outcome = round.Answer(10m, "Daft Punk", "Get Lucky", Daft, Matcher).Outcome!;
        Assert.Equal(1, outcome.HintLevelUsed);
    }

    [Fact]
    public void Parcours_ProlongerLEcouteSeule_RevelaitRienQuiCoute() =>
        Assert.Equal(0, TrackRound.Start.Listen(0.5m).Listen(10m).Answer(10m, "x", "y", Daft, Matcher).Outcome!.HintLevelUsed);
}
