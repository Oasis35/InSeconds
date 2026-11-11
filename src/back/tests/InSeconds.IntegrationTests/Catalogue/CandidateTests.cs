using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Testing.Deezer;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// Le sas « À valider » : l'import met des morceaux de Deezer en attente (lus en arrière-plan, par lots), l'admin les écoute puis les ajoute au pool ou
/// les écarte. Rien n'entre au pool sans son clic. Le faux Deezer connaît tout identifiant sous 7 milliards (quota à partir de là, introuvable à
/// partir de 8, sans extrait à partir de 9).
/// </summary>
public class CandidateTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Candidates = "/api/admin/catalogue/candidates";

    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    private static ImportCandidateItem Item(long id, string? priority = null) => new(id, priority);

    private async Task<ImportCandidatesResult> ImportAsync(params ImportCandidateItem[] items)
    {
        var response = await _app.Admin().PostAsJsonAsync(Candidates, new ImportCandidates(items), Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<ImportCandidatesResult>(Ct))!;
    }

    [Fact]
    public async Task Import_DuMemeIdentifiantEnMemeTemps_UnSeulCandidat_JamaisUneErreur500()
    {
        // Les imports passent tous la vérification préalable puis s'enregistrent ensemble : l'index unique refuse les autres (409 « réessaie »)
        // ou ils trouvent déjà le candidat (200) ; jamais une 500, et une seule ligne.
        var admin = _app.Admin();

        var responses = await Task.WhenAll(Enumerable.Range(0, 6)
            .Select(_ => admin.PostAsJsonAsync(Candidates, new ImportCandidates([Item(6000777)]), Ct)));

        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM catalogue.candidates"));
    }

    private async Task<IReadOnlyList<CandidateItem>> ListAsync() =>
        (await _app.Admin().GetFromJsonAsync<List<CandidateItem>>(Candidates, Ct))!;

    /// <summary>Attend que la lecture en arrière-plan ait fini (plus aucun candidat « pending »).</summary>
    private async Task<IReadOnlyList<CandidateItem>> ListWhenReadAsync(int expected)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var list = await ListAsync();
            if (list.Count == expected && list.All(c => c.Status != "pending"))
                return list;
            await Task.Delay(100, Ct);
        }

        Assert.Fail("La lecture des candidats n'a pas fini à temps.");
        return [];
    }

    /// <summary>Attend que la liste vérifie la condition (l'ajout au pool passe aussi par un message).</summary>
    private async Task<IReadOnlyList<CandidateItem>> ListUntilAsync(Func<IReadOnlyList<CandidateItem>, bool> done)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var list = await ListAsync();
            if (done(list))
                return list;
            await Task.Delay(100, Ct);
        }

        Assert.Fail("L'état attendu du sas n'est pas arrivé à temps.");
        return [];
    }

    private async Task<HttpResponseMessage> PostAsync(string path, object body) => await _app.Admin().PostAsJsonAsync(path, body, Ct);

    // ---------- Import et lecture ----------

    [Fact]
    public async Task Importer_LitLesMorceauxChezDeezer_EtLesListe()
    {
        var result = await ImportAsync(Item(1001, "a"), Item(1002));

        Assert.Equal(new ImportCandidatesResult(2, 0, 0), result);
        var list = await ListWhenReadAsync(2);
        var first = list.Single(c => c.DeezerTrackId == 1001);
        Assert.Equal("A", first.Priority);
        Assert.Equal("ready", first.Status);
        Assert.Equal("E2E Artist", first.Artist);
        Assert.Equal("E2E Track 1001", first.Title);
        Assert.Equal(2015, first.ReleaseYear);
        Assert.Equal(500_001, first.Rank);
        Assert.Equal("available", first.PreviewStatus);
        Assert.False(first.InCatalogue);
        Assert.False(first.IsDismissed);
        Assert.Null(list.Single(c => c.DeezerTrackId == 1002).Priority);
    }

    [Fact]
    public async Task Importer_NAjouteRienAuPool()
    {
        await ImportAsync(Item(1001), Item(1002));
        await ListWhenReadAsync(2);

        Assert.Empty(await _app.ListAsync());
    }

    [Fact]
    public async Task Importer_PlusDUnLot_LesLitTous()
    {
        // Le lot est de 10 : 25 morceaux font trois messages.
        await ImportAsync([.. Enumerable.Range(2000, 25).Select(i => Item(i))]);

        var list = await ListWhenReadAsync(25);

        Assert.All(list, c => Assert.Equal("ready", c.Status));
    }

    [Fact]
    public async Task Importer_UnMorceauDejaAuPool_NEntrePasDansLeSas()
    {
        await _app.AddAsync(1001);

        var result = await ImportAsync(Item(1001), Item(1002));

        Assert.Equal(new ImportCandidatesResult(1, 0, 1), result);
        Assert.Equal([1002L], (await ListWhenReadAsync(1)).Select(c => c.DeezerTrackId));
    }

    [Fact]
    public async Task Importer_DeuxFois_NeDuplique_EtPrendLaPrioriteManquante()
    {
        await ImportAsync(Item(1001));
        await ListWhenReadAsync(1);

        var result = await ImportAsync(Item(1001, "b"), Item(1001, "c"), Item(1003));

        // Un identifiant qui revient dans la même demande garde la première priorité.
        Assert.Equal(new ImportCandidatesResult(1, 1, 0), result);
        var list = await ListWhenReadAsync(2);
        Assert.Equal("B", list.Single(c => c.DeezerTrackId == 1001).Priority);
    }

    [Fact]
    public async Task Importer_UnePrioriteDejaPosee_NEstPasChangee()
    {
        await ImportAsync(Item(1001, "a"));
        await ListWhenReadAsync(1);

        await ImportAsync(Item(1001, "c"));

        Assert.Equal("A", (await ListWhenReadAsync(1)).Single().Priority);
    }

    [Fact]
    public async Task Lecture_MorceauInconnuOuSansExtrait_EstMarque()
    {
        await ImportAsync(Item(FakeDeezerHandler.NotFoundFrom + 1), Item(FakeDeezerHandler.NoPreviewFrom + 1), Item(1001));

        var list = await ListWhenReadAsync(3);

        Assert.Equal("not_found", list.Single(c => c.DeezerTrackId == FakeDeezerHandler.NotFoundFrom + 1).Status);
        var withoutPreview = list.Single(c => c.DeezerTrackId == FakeDeezerHandler.NoPreviewFrom + 1);
        Assert.Equal("ready", withoutPreview.Status);
        Assert.Equal("missing", withoutPreview.PreviewStatus);
    }

    [Fact]
    public async Task Lecture_DeezerNeRepondPas_LeCandidatResteALire_EtRelireLeReprend()
    {
        var quota = FakeDeezerHandler.QuotaFrom + 1;
        await ImportAsync(Item(quota), Item(1001));
        await ListUntilAsync(list => list.Any(c => c.DeezerTrackId == 1001 && c.Status == "ready"));

        Assert.Equal("pending", (await ListAsync()).Single(c => c.DeezerTrackId == quota).Status);
        Assert.Equal(1, await RereadAsync());
    }

    private async Task<int> RereadAsync()
    {
        var response = await _app.Admin().PostAsync($"{Candidates}/reread", null, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RereadCandidatesResult>(Ct))!.Count;
    }

    [Fact]
    public async Task Relire_SansCandidatEnAttente_NeFaitRien()
    {
        await ImportAsync(Item(1001));
        await ListWhenReadAsync(1);

        Assert.Equal(0, await RereadAsync());
    }

    [Fact]
    public async Task Importer_Invalide_400()
    {
        await AssertBadRequestAsync(new ImportCandidates([]));
        await AssertBadRequestAsync(new ImportCandidates([Item(0)]));
        await AssertBadRequestAsync(new ImportCandidates([Item(5, "Z")]));
        await AssertBadRequestAsync(new ImportCandidates([.. Enumerable.Range(1, 1001).Select(i => Item(i))]));
    }

    private async Task AssertBadRequestAsync(ImportCandidates body)
    {
        var response = await PostAsync(Candidates, body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Routes_SansAdmin_Refusees()
    {
        var anonymous = _app.Api.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Candidates, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync(Candidates, new ImportCandidates([Item(1)]), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"{Candidates}/add", new AddCandidates([1]), Ct)).StatusCode);
    }

    // ---------- Écarter ----------

    [Fact]
    public async Task Ecarter_GardeLeCandidat_EcarteSansLEnvoyerAuPool_EtLeRemetSurDemande()
    {
        await ImportAsync(Item(1001), Item(1002));
        var ids = (await ListWhenReadAsync(2)).Select(c => c.Id).ToList();

        var dismiss = await _app.Admin().PutAsJsonAsync($"{Candidates}/dismissed", new DismissCandidates([ids[0]], true), Ct);
        Assert.Equal(HttpStatusCode.NoContent, dismiss.StatusCode);
        var list = await ListAsync();
        Assert.True(list.Single(c => c.Id == ids[0]).IsDismissed);
        Assert.False(list.Single(c => c.Id == ids[1]).IsDismissed);

        // Un candidat écarté n'est pas rouvert par un nouvel import du même morceau.
        var again = await ImportAsync(Item(1001));
        Assert.Equal(new ImportCandidatesResult(0, 1, 0), again);
        Assert.True((await ListAsync()).Single(c => c.Id == ids[0]).IsDismissed);

        await _app.Admin().PutAsJsonAsync($"{Candidates}/dismissed", new DismissCandidates([ids[0]], false), Ct);
        Assert.False((await ListAsync()).Single(c => c.Id == ids[0]).IsDismissed);
    }

    [Fact]
    public async Task Ecarter_SansIdentifiant_400()
    {
        var response = await _app.Admin().PutAsJsonAsync($"{Candidates}/dismissed", new DismissCandidates([], true), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---------- Ajouter au pool ----------

    [Fact]
    public async Task Ajouter_MetLeMorceauAuPool_AvecSesGenres_EtLeRetireDuSas()
    {
        await ImportAsync(Item(1001), Item(1002));
        var ids = (await ListWhenReadAsync(2)).Select(c => c.Id).ToList();

        var response = await PostAsync($"{Candidates}/add", new AddCandidates([ids[0]]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new AddCandidatesResult(1, 0), await response.Content.ReadFromJsonAsync<AddCandidatesResult>(Ct));
        var list = await ListUntilAsync(l => l.Count == 1);
        Assert.Equal(1002, list.Single().DeezerTrackId);

        var pool = await _app.ListAsync();
        var track = Assert.Single(pool);
        Assert.Equal(1001, track.DeezerTrackId);
        Assert.Equal("E2E Artist", track.Artist);
        Assert.Equal("E2E Track 1001", track.Title);
        Assert.Equal(2015, track.ReleaseYear);
        Assert.Equal(500_001, track.Rank);
        Assert.Equal("available", track.PreviewStatus);
        // L'album 1001 % 10 + 1 = 2 : « Rap/Hip Hop » et « Dance ».
        Assert.Equal(["Dance", "Rap/Hip Hop"], track.Genres.Order());
        Assert.False(track.IsDisabled);
    }

    [Fact]
    public async Task Ajouter_PlusieursMorceauxDUnMemeGenreNeuf_NeCreentQuUnGenre()
    {
        // 1001, 1011 et 1021 ont le même album (2) : les genres neufs « Rap/Hip Hop » et « Dance » sont créés une seule fois.
        await ImportAsync(Item(1001), Item(1011), Item(1021));
        var ids = (await ListWhenReadAsync(3)).Select(c => c.Id).ToList();

        await PostAsync($"{Candidates}/add", new AddCandidates(ids));
        await ListUntilAsync(l => l.Count == 0);

        var pool = await _app.ListAsync();
        Assert.Equal(3, pool.Count);
        Assert.All(pool, t => Assert.Equal(["Dance", "Rap/Hip Hop"], t.Genres.Order()));
        Assert.Equal(2L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM catalogue.genres"));
    }

    [Fact]
    public async Task Ajouter_PlusDUnLot_AjouteTout()
    {
        await ImportAsync([.. Enumerable.Range(2000, 25).Select(i => Item(i))]);
        var ids = (await ListWhenReadAsync(25)).Select(c => c.Id).ToList();

        await PostAsync($"{Candidates}/add", new AddCandidates(ids));
        await ListUntilAsync(l => l.Count == 0);

        Assert.Equal(25, (await _app.ListAsync()).Count);
    }

    [Fact]
    public async Task Ajouter_Ignore_LesCandidatsSansExtrait_Ecartes_OuInconnus()
    {
        await ImportAsync(Item(FakeDeezerHandler.NoPreviewFrom + 1), Item(1001), Item(1002), Item(FakeDeezerHandler.NotFoundFrom + 1));
        var list = await ListWhenReadAsync(4);
        var noPreview = list.Single(c => c.DeezerTrackId == FakeDeezerHandler.NoPreviewFrom + 1).Id;
        var dismissed = list.Single(c => c.DeezerTrackId == 1001).Id;
        var notFound = list.Single(c => c.DeezerTrackId == FakeDeezerHandler.NotFoundFrom + 1).Id;
        await _app.Admin().PutAsJsonAsync($"{Candidates}/dismissed", new DismissCandidates([dismissed], true), Ct);

        var response = await PostAsync($"{Candidates}/add", new AddCandidates([noPreview, dismissed, notFound, 987654321]));

        Assert.Equal(new AddCandidatesResult(0, 4), await response.Content.ReadFromJsonAsync<AddCandidatesResult>(Ct));
        Assert.Empty(await _app.ListAsync());
        Assert.Equal(4, (await ListAsync()).Count);
    }

    [Fact]
    public async Task Ajouter_UnMorceauDevenuMembreDuPool_QuitteLeSasSansDoublon()
    {
        await ImportAsync(Item(1001));
        var id = (await ListWhenReadAsync(1)).Single().Id;
        // Ajouté à la main pendant que le candidat attend : le candidat reste dans le sas, marqué « déjà au catalogue ».
        await _app.AddAsync(1001);
        Assert.True((await ListAsync()).Single().InCatalogue);

        var response = await PostAsync($"{Candidates}/add", new AddCandidates([id]));

        Assert.Equal(new AddCandidatesResult(0, 1), await response.Content.ReadFromJsonAsync<AddCandidatesResult>(Ct));
        Assert.Single(await _app.ListAsync());
    }

    [Fact]
    public async Task Ajouter_DeezerAlbumIndisponible_AjouteQuandMemeSansGenres()
    {
        await ImportAsync(Item(1001));
        var id = (await ListWhenReadAsync(1)).Single().Id;
        _app.Deezer.Intercept = (request, _) => Task.FromResult<HttpResponseMessage?>(
            request.RequestUri!.AbsolutePath.StartsWith("/album/", StringComparison.Ordinal)
                ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                : null);

        await PostAsync($"{Candidates}/add", new AddCandidates([id]));
        await ListUntilAsync(l => l.Count == 0);

        var track = Assert.Single(await _app.ListAsync());
        Assert.Empty(track.Genres);
    }

    // ---------- Écoute ----------

    [Fact]
    public async Task Ecouter_DonneUneAdresseDExtraitNeuve()
    {
        await ImportAsync(Item(1001));
        var id = (await ListWhenReadAsync(1)).Single().Id;

        var preview = await _app.Admin().GetFromJsonAsync<CandidatePreview>($"{Candidates}/{id}/preview", Ct);

        Assert.False(string.IsNullOrEmpty(preview!.Url));
    }

    [Fact]
    public async Task Ecouter_CandidatInconnu_404()
    {
        var response = await _app.Admin().GetAsync($"{Candidates}/123456/preview", Ct);

        await AssertProblemAsync(response, HttpStatusCode.NotFound, "catalogue.candidate_not_found");
    }

    [Fact]
    public async Task Ecouter_SansExtrait_422()
    {
        await ImportAsync(Item(FakeDeezerHandler.NoPreviewFrom + 1));
        var id = (await ListWhenReadAsync(1)).Single().Id;

        var response = await _app.Admin().GetAsync($"{Candidates}/{id}/preview", Ct);

        await AssertProblemAsync(response, HttpStatusCode.UnprocessableEntity, "catalogue.candidate_preview_missing");
    }

    [Fact]
    public async Task Ecouter_DeezerNeRepondPas_503()
    {
        await ImportAsync(Item(1001));
        var id = (await ListWhenReadAsync(1)).Single().Id;
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

        var response = await _app.Admin().GetAsync($"{Candidates}/{id}/preview", Ct);

        await AssertProblemAsync(response, HttpStatusCode.ServiceUnavailable, "catalogue.deezer_unavailable");
    }
}
