namespace InSeconds.MigrationTests;

/// <summary>Partie Catalogue de l'import (§ 8.2, 8.5 et 8.6 du plan v2), par le vrai <c>run-import.sh</c>.</summary>
public class CatalogueImportTests(ImportDatabase database)
{
    private static readonly DateTimeOffset Edited = new(2026, 9, 12, 14, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task Morceaux_RepriseALIdentique_IdentifiantsCompris()
    {
        var cs = await database.CreateDatabaseAsync();
        // Identifiants non contigus : des morceaux supprimés du pool ont laissé des trous.
        var plain = new V1Track(3, 1001) { Artist = "Daft Punk", Title = "One More Time (Radio Edit)", ReleaseYear = 2000, UpdatedAt = Edited };
        var noMetadata = new V1Track(17, 1002) { CoverHash = null, ReleaseYear = null };
        var accented = new V1Track(42, 1003) { Artist = "Mylène Farmer", Title = "L'Âme-stram-gram", ReleaseYear = 1999 };
        await V1Data.InsertTracksAsync(cs, plain, noMetadata, accented);

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(3L, await Count(cs, "catalogue.tracks"));
        Assert.Equal(1L, await Count(cs,
            $"catalogue.tracks WHERE id = 3 AND deezer_track_id = 1001 AND artist = 'Daft Punk' AND title = 'One More Time (Radio Edit)' " +
            $"AND cover_hash = 'abc123' AND release_year = 2000 AND created_at = {V1Data.Sql(plain.CreatedAt)} AND updated_at = {V1Data.Sql(Edited)}"));
        Assert.Equal(1L, await Count(cs, "catalogue.tracks WHERE id = 17 AND cover_hash IS NULL AND release_year IS NULL AND updated_at IS NULL"));
        Assert.Equal(1L, await Count(cs, "catalogue.tracks WHERE id = 42 AND artist = 'Mylène Farmer' AND title = 'L''Âme-stram-gram'"));
    }

    [Fact]
    public async Task Extrait_HasPreviewDevientDisponibleOuAbsent_RangEtControleInconnus()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertTracksAsync(cs,
            new V1Track(1, 1) { HasPreview = true },
            new V1Track(2, 2) { HasPreview = false });

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(1L, await Count(cs, "catalogue.tracks WHERE id = 1 AND preview_status = 1"));
        Assert.Equal(1L, await Count(cs, "catalogue.tracks WHERE id = 2 AND preview_status = 2"));
        // Rien n'a été contrôlé chez Deezer : la tâche catalogue-refresh remplit le rang la nuit suivante.
        Assert.Equal(2L, await Count(cs, "catalogue.tracks WHERE deezer_rank IS NULL AND rank_updated_at IS NULL AND preview_checked_at IS NULL"));
    }

    [Fact]
    public async Task Desactivation_DateDeLaDerniereModification_ABsenceMaintenant()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertTracksAsync(cs,
            new V1Track(1, 1) { IsDisabled = true, UpdatedAt = Edited },
            new V1Track(2, 2) { IsDisabled = true },
            new V1Track(3, 3));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(1L, await Count(cs, $"catalogue.tracks WHERE id = 1 AND disabled_at = {V1Data.Sql(Edited)}"));
        // Pas de date en v1 : l'instant de l'import, jamais une date plus ancienne inventée.
        Assert.Equal(1L, await Count(cs, "catalogue.tracks WHERE id = 2 AND disabled_at > now() - interval '5 minutes' AND disabled_at <= now()"));
        Assert.Equal(1L, await Count(cs, "catalogue.tracks WHERE id = 3 AND disabled_at IS NULL"));
    }

    [Fact]
    public async Task MorceauDejaUtilise_Importe_SansReprendreSonUsage()
    {
        // LastUsedDate et UsageCount se recalculent depuis les défis (§ 8.3) : la table v2 n'a pas ces colonnes,
        // et un morceau déjà utilisé en v1 s'importe sans erreur. Leur vérification vient avec Daily (E4).
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertTracksAsync(cs, new V1Track(1, 1) { LastUsedDate = new DateOnly(2026, 9, 29), UsageCount = 4 });

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(0L, await Count(cs,
            "information_schema.columns WHERE table_schema = 'catalogue' AND table_name = 'tracks' AND column_name IN ('last_used_date', 'usage_count')"));
    }

    [Fact]
    public async Task Sequence_RecaleeApresLePlusGrandIdentifiant()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertTracksAsync(cs, new V1Track(5, 1), new V1Track(731, 2), new V1Track(12, 3));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        // Le premier lot tiré par la v2 ne recouvre aucun identifiant importé (le premier morceau ajouté en v2
        // prendrait sinon celui d'un morceau de la v1 : conflit sur la clé primaire).
        var next = await ImportDatabase.ScalarAsync<long>(cs, "SELECT nextval('catalogue.tracks_hilo')");
        Assert.Equal(732L, next);
        // Tel que l'API v2 l'insère : un morceau neuf avec l'identifiant de ce lot.
        await ImportDatabase.ExecuteAsync(cs, $"""
            INSERT INTO catalogue.tracks (id, deezer_track_id, artist, title, preview_status, created_at)
            VALUES ({next}, 99, 'Nouveau', 'Morceau', 1, now())
            """);
        Assert.Equal(4L, await Count(cs, "catalogue.tracks"));
    }

    [Fact]
    public async Task CatalogueVide_ImportPasse_SequenceAuDebut()
    {
        var cs = await database.CreateDatabaseAsync();

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(0L, await Count(cs, "catalogue.tracks"));
        Assert.Equal(1L, await ImportDatabase.ScalarAsync<long>(cs, "SELECT nextval('catalogue.tracks_hilo')"));
    }

    [Fact]
    public async Task Rejouable_RemetLeCatalogueDansLEtatDeLaV1()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertTracksAsync(cs, new V1Track(1, 1) { Artist = "Avant" });
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);

        // Entre deux imports : un morceau ajouté en v2, un morceau v1 renommé en v2, un autre changé en v1.
        await ImportDatabase.ExecuteAsync(cs, """
            INSERT INTO catalogue.tracks (id, deezer_track_id, artist, title, preview_status, created_at)
            VALUES (500, 500, 'Ajouté en v2', 'Perdu', 1, now());
            UPDATE catalogue.tracks SET artist = 'Renommé en v2' WHERE id = 1;
            UPDATE public."Tracks" SET "Artist" = 'Après', "IsDisabled" = true WHERE "Id" = 1;
            """);
        var second = await database.RunImportAsync(cs);

        Assert.True(second.ExitCode == 0, second.Output);
        Assert.Equal(1L, await Count(cs, "catalogue.tracks"));
        Assert.Equal(1L, await Count(cs, "catalogue.tracks WHERE id = 1 AND artist = 'Après' AND disabled_at IS NOT NULL"));
    }

    [Fact]
    public async Task AnneeHorsLimites_ImportRefuse_RienNEstGarde()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertTracksAsync(cs, new V1Track(1, 1), new V1Track(2, 2) { ReleaseYear = 40000 });

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("année de sortie est hors limites, morceaux : 2", result.Output, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "catalogue.tracks"));
    }

    [Theory]
    [InlineData("UPDATE catalogue.tracks SET artist = 'Autre' WHERE id = 1;", "morceaux repris à l'identique")]
    [InlineData("UPDATE catalogue.tracks SET release_year = 1999 WHERE id = 1;", "morceaux repris à l'identique")]
    [InlineData("UPDATE catalogue.tracks SET deezer_track_id = 777 WHERE id = 1;", "morceaux repris à l'identique")]
    [InlineData("DELETE FROM catalogue.tracks WHERE id = 2;", "Vérification « morceaux » :")]
    [InlineData("UPDATE catalogue.tracks SET title = 'Autre' WHERE id = 1;", "morceaux repris à l'identique")]
    [InlineData("UPDATE catalogue.tracks SET cover_hash = 'x' WHERE id = 1;", "morceaux repris à l'identique")]
    [InlineData("UPDATE catalogue.tracks SET updated_at = now() WHERE id = 1;", "morceaux repris à l'identique")]
    [InlineData("UPDATE catalogue.tracks SET preview_checked_at = now() WHERE id = 1;", "état de l'extrait")]
    [InlineData("UPDATE catalogue.tracks SET preview_status = 2 WHERE id = 1;", "état de l'extrait")]
    [InlineData("UPDATE catalogue.tracks SET deezer_rank = 10 WHERE id = 1;", "état de l'extrait")]
    [InlineData("UPDATE catalogue.tracks SET disabled_at = now() WHERE id = 1;", "morceaux désactivés")]
    [InlineData("UPDATE catalogue.tracks SET disabled_at = NULL WHERE id = 3;", "morceaux désactivés")]
    [InlineData("UPDATE catalogue.tracks SET disabled_at = disabled_at + interval '1 hour' WHERE id = 3;", "morceaux désactivés")]
    [InlineData("SELECT setval('catalogue.tracks_hilo', 1, false);", "séquence des identifiants de morceaux")]
    public async Task Verification_DetecteUnEcart_EtAnnuleTout(string tampering, string expectedCheck)
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertTracksAsync(cs,
            new V1Track(1, 1),
            new V1Track(2, 2) { HasPreview = false },
            new V1Track(3, 3) { IsDisabled = true, HasPreview = false, UpdatedAt = Edited });

        var error = await ImportWithTamperingAsync(cs, tampering);

        Assert.Contains(expectedCheck, error.MessageText, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "catalogue.tracks"));
    }

    /// <summary>Même enchaînement que run-import.sh, avec un écart glissé entre l'import et la vérification.</summary>
    private static async Task<Npgsql.PostgresException> ImportWithTamperingAsync(string connectionString, string tamperingSql)
    {
        var directory = Path.Combine(ImportDatabase.RepositoryRoot, "deploy", "migration-v2");
        var script = string.Join("\n",
            File.ReadAllText(Path.Combine(directory, "00-import-state.sql")),
            File.ReadAllText(Path.Combine(directory, "10-import.sql")),
            tamperingSql,
            File.ReadAllText(Path.Combine(directory, "20-verify.sql")));
        return await Assert.ThrowsAsync<Npgsql.PostgresException>(
            () => ImportDatabase.ExecuteAsync(connectionString, $"BEGIN;\n{script}\nCOMMIT;"));
    }

    private static Task<long> Count(string cs, string fromWhere) =>
        ImportDatabase.ScalarAsync<long>(cs, $"SELECT count(*) FROM {fromWhere}");
}
