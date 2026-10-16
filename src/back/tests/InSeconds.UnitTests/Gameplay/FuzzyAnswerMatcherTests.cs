using InSeconds.Api.Modules.Gameplay.Domain;

namespace InSeconds.UnitTests.Gameplay;

/// <summary>La correction des réponses : cas de la v1 repris, plus les limites de la tolérance.</summary>
public class FuzzyAnswerMatcherTests
{
    private readonly FuzzyAnswerMatcher _matcher = new();

    // --- correspondances exactes (casse, accents, ponctuation) ---

    // La normalisation seule doit suffire : ces cas passent par un correcteur SANS tolérance, sinon une
    // normalisation cassée serait masquée par la distance de Levenshtein.
    private readonly FuzzyAnswerMatcher _exact = new(maxTypos: 0);

    [Theory]
    [InlineData("Daft Punk", "Daft Punk")]
    [InlineData("daft punk", "Daft Punk")]
    [InlineData("DAFT PUNK", "Daft Punk")]
    [InlineData("Beyonce", "Beyoncé")]
    [InlineData("Beyoncé", "Beyonce")]
    [InlineData("Mylène Farmer", "mylene farmer")]
    [InlineData("Ça va", "Ca va")]
    [InlineData("  Daft   Punk  ", "Daft Punk")]
    [InlineData("Daft, Punk!", "Daft Punk")]
    public void IsMatch_CasseAccentsEspacesEtPonctuation_IgnoresParLaNormalisation(string given, string expected) =>
        Assert.True(_exact.IsMatch(given, expected));

    [Fact]
    public void IsMatch_UnAccentDeTropOuDeMoins_NEstPasUneFauteDeFrappe() =>
        // Sans tolérance, « Beyoncé » et « Beyonc » sont différents : seule la normalisation efface les accents.
        Assert.False(_exact.IsMatch("Beyonc", "Beyoncé"));

    [Theory]
    [InlineData("Jay-Z", "Jay Z")] // « jayz » contre « jay z » : une faute
    [InlineData("L'Aigle noir", "L Aigle noir")]
    public void IsMatch_PonctuationRemplaceeParUnEspace_EstUneFauteDeFrappe(string given, string expected)
    {
        Assert.False(_exact.IsMatch(given, expected));
        Assert.True(_matcher.IsMatch(given, expected));
    }

    // --- mots vides ---

    [Theory]
    [InlineData("The Beatles", "Beatles")]
    [InlineData("Beatles", "The Beatles")]
    [InlineData("Les Rita Mitsouko", "Rita Mitsouko")]
    [InlineData("Simon and Garfunkel", "Simon Garfunkel")]
    public void IsMatch_MotsVides_Ignores(string given, string expected) =>
        Assert.True(_exact.IsMatch(given, expected));

    [Fact]
    public void IsMatch_UnFeatAbsentDeLaSaisie_NEstPasIgnore() =>
        // « feat » est un mot vide, mais « kanye west » reste dans la référence : trop loin de « jay z ».
        Assert.False(_matcher.IsMatch("Jay Z", "Jay-Z feat. Kanye West"));

    // --- parenthèses et crochets ---

    [Theory]
    [InlineData("Shape of You", "Shape of You (feat. Ed Sheeran)")]
    [InlineData("Blinding Lights", "Blinding Lights [Radio Edit]")]
    [InlineData("Song", "Song (Live) [Remastered]")]
    [InlineData("Song (Live)", "Song")]
    public void IsMatch_ParenthesesEtCrochets_Ignores(string given, string expected) =>
        Assert.True(_exact.IsMatch(given, expected));

    [Fact]
    public void IsMatch_ParenthesesNonFermees_RestentDuTexte() =>
        Assert.False(_exact.IsMatch("Song", "Song (Live"));

    // --- saisie démesurée ---

    [Fact]
    public void IsMatch_SaisieDemesuree_RefuseSansLaLire()
    {
        Assert.False(_matcher.IsMatch(new string('(', 100_000), "Coldplay"));
        Assert.False(_matcher.IsMatch("Coldplay" + new string(' ', FuzzyAnswerMatcher.MaxInputLength), "Coldplay"));
    }

    [Fact]
    public void IsMatch_SaisieALaLimite_EstEncoreLue() =>
        Assert.True(_matcher.IsMatch("Coldplay" + new string(' ', FuzzyAnswerMatcher.MaxInputLength - "Coldplay".Length), "Coldplay"));

    // --- fautes de frappe ---

    [Fact]
    public void IsMatch_DeuxFautesSurUneReponseLongue_Accepte() =>
        Assert.True(_matcher.IsMatch("Coldpaly", "Coldplay")); // transposition : distance 2

    [Fact]
    public void IsMatch_TroisFautes_Refuse() =>
        Assert.False(_matcher.IsMatch("Coldxyzay", "Coldplay"));

    [Fact]
    public void IsMatch_ToleranceMaximaleConfigurable()
    {
        var strict = new FuzzyAnswerMatcher(maxTypos: 0);
        Assert.False(strict.IsMatch("Coldpaly", "Coldplay"));
        Assert.True(strict.IsMatch("coldplay", "Coldplay"));

        var lenient = new FuzzyAnswerMatcher(maxTypos: 3);
        Assert.False(strict.IsMatch("Radxohxxd", "Radiohead")); // trois fautes
        Assert.False(new FuzzyAnswerMatcher().IsMatch("Radxohxxd", "Radiohead"));
        Assert.True(lenient.IsMatch("Radxohxxd", "Radiohead")); // trois fautes sur 9 caractères : permises à partir de 3
    }

    // --- seuil proportionné à la longueur de la référence (réponses courtes) ---

    [Theory]
    [InlineData("XX", "U2", false)] // 2 caractères : égalité stricte
    [InlineData("U2", "U2", true)]
    [InlineData("U3", "U2", false)]
    [InlineData("N83", "M83", true)] // 3 caractères : une faute
    [InlineData("N93", "M83", false)] // deux fautes
    [InlineData("Muze", "Muse", true)] // 4 caractères : une faute
    [InlineData("Mzze", "Muse", false)]
    [InlineData("Oazis", "Oasis", true)] // 5 caractères : une faute
    [InlineData("Oazzs", "Oasis", false)]
    [InlineData("Radiohed", "Radiohead", true)] // 9 caractères : jusqu'à deux fautes (ici une)
    [InlineData("Radiohxxd", "Radiohead", true)] // deux fautes
    [InlineData("Radxohxxd", "Radiohead", false)] // trois fautes
    public void IsMatch_ToleranceSelonLaLongueurDeLaReference(string given, string expected, bool match) =>
        Assert.Equal(match, _matcher.IsMatch(given, expected));

    [Fact]
    public void IsMatch_AllongerLaSaisie_NeGonflePasLaTolerance() =>
        // La tolérance dépend de la référence (« U2 », strict), pas de la saisie.
        Assert.False(_matcher.IsMatch("U2 U2 U2", "U2"));

    // --- réponses vides ---

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void IsMatch_ReponseVide_Refuse(string? given) =>
        Assert.False(_matcher.IsMatch(given, "Coldplay"));

    [Fact]
    public void IsMatch_ReponseQuiNeContientQueDesMotsVidesOuDeLaPonctuation_Refuse()
    {
        Assert.False(_matcher.IsMatch("the", "Coldplay"));
        Assert.False(_matcher.IsMatch("!!!", "Coldplay"));
        Assert.False(_matcher.IsMatch("(live)", "Coldplay"));
    }

    [Fact]
    public void IsMatch_ReferenceFaiteDeMotsVides_NeAccepteQuUneSaisieEquivalente()
    {
        // « The The » (groupe réel) se normalise en chaîne vide : seule une saisie qui se normalise pareil l'égale.
        Assert.True(_matcher.IsMatch("The The", "The The"));
        Assert.False(_matcher.IsMatch("Coldplay", "The The"));
    }

    [Fact]
    public void IsMatch_ReferenceNulle_Leve() =>
        Assert.Throws<ArgumentNullException>(() => _matcher.IsMatch("Coldplay", null!));

    [Fact]
    public void IsMatch_ToleranceNegative_Refusee() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => new FuzzyAnswerMatcher(-1));

    // --- pas de correspondance ---

    [Theory]
    [InlineData("Radiohead", "Coldplay")]
    [InlineData("Daft Punk", "Stromae")]
    [InlineData("Lose Yourself", "Get Lucky")]
    public void IsMatch_ReponsesDifferentes_Refuse(string given, string expected) =>
        Assert.False(_matcher.IsMatch(given, expected));

    // --- chiffres et caractères non latins ---

    [Fact]
    public void IsMatch_Chiffres_ComptentCommeDesLettres()
    {
        Assert.True(_matcher.IsMatch("Blink 182", "Blink-182"));
        Assert.False(_matcher.IsMatch("Blink", "Blink 182")); // le nombre manque : trop loin
    }

    [Fact]
    public void IsMatch_LettresNonLatines_SontGardees() =>
        Assert.True(_matcher.IsMatch("Сплин", "сплин"));
}
