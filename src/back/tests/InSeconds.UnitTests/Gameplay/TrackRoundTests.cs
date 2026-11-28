using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;

namespace InSeconds.UnitTests.Gameplay;

/// <summary>La manche : plancher d'écoute, réponse. Le piège 35.</summary>
public class TrackRoundTests
{
    private static readonly TrackNames Daft = new("Daft Punk", "Get Lucky (feat. Pharrell Williams)");
    private static readonly IAnswerMatcher Matcher = new FuzzyAnswerMatcher();

    // --- écouter : le plancher garde le maximum ---

    [Theory]
    [InlineData("22h31 - Fais les backs")]
    [InlineData("Fais les backs")]
    public void Answer_UnTitreAlternatif_EstUneBonneReponse(string title)
    {
        var names = new TrackNames("Artiste", "Fais les backs", ["22h31 - Fais les backs"]);

        var result = TrackRound.Start.Answer(1m, "Artiste", title, names, Matcher);

        Assert.True(result.Outcome!.TitleCorrect);
    }

    [Fact]
    public void Answer_SansTitreAlternatif_LAutreVarianteEstFausse()
    {
        var names = new TrackNames("Artiste", "Fais les backs");

        var result = TrackRound.Start.Answer(1m, "Artiste", "22h31 - Fais les backs", names, Matcher);

        Assert.False(result.Outcome!.TitleCorrect);
    }

    [Fact]
    public void Answer_UnTitreAlternatif_NeValideJamaisLArtiste()
    {
        var names = new TrackNames("Artiste", "Titre", ["Autre titre"]);

        var result = TrackRound.Start.Answer(1m, "Autre titre", "Titre", names, Matcher);

        Assert.False(result.Outcome!.ArtistCorrect);
    }

    [Fact]
    public void Start_NAPasEncoreRienEcoute()
    {
        Assert.Equal(0m, TrackRound.Start.ListenedSeconds);
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
    public void Listen_DureeNegative_Refusee() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackRound.Start.Listen(-0.5m));

    // --- reprise d'une manche enregistrée ---

    [Fact]
    public void Resume_RedonneLEtatEnregistre()
    {
        var round = TrackRound.Resume(3m);

        Assert.Equal(3m, round.ListenedSeconds);
    }

    [Fact]
    public void DeuxManchesDeMemeEtat_SontEgales() =>
        Assert.Equal(TrackRound.Resume(5m), TrackRound.Start.Listen(5m));

    [Fact]
    public void Resume_DureeNegative_Refusee()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackRound.Resume(-1m));
    }

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
    public void Answer_ChangeRien_LaMancheResteReutilisable()
    {
        var round = TrackRound.Start.Listen(3m);

        round.Answer(3m, "Daft Punk", "Get Lucky", Daft, Matcher);

        Assert.Equal(TrackRound.Resume(3m), round);
    }

    [Fact]
    public void Answer_CorrecteurEtReferenceAbsents_Leve()
    {
        Assert.Throws<ArgumentNullException>(() => TrackRound.Start.Answer(1m, "a", "b", null!, Matcher));
        Assert.Throws<ArgumentNullException>(() => TrackRound.Start.Answer(1m, "a", "b", Daft, null!));
    }
}
