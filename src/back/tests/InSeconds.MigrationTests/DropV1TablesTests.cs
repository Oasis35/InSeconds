namespace InSeconds.MigrationTests;

/// <summary>
/// Suppression des tables v1 (<c>deploy/vps/drop-v1-tables.sql</c>, PR I1 #235), lancée par <c>deploy/vps/drop-v1-tables.sh</c> : jamais
/// avant l'ouverture de la v2 (<c>infra.import_state.opened_at</c>, posé à la bascule), jamais si <c>public</c> contient une table inconnue,
/// et les données v2 restent intactes.
/// </summary>
public class DropV1TablesTests(ScriptDatabase database)
{
    private const string PublicTables = "pg_tables WHERE schemaname = 'public'";

    [Fact]
    public async Task BasculeFaite_TablesV1Supprimees_DonneesGardees_Rejouable()
    {
        var cs = await DatabaseAsync(opened: true);

        var result = await database.RunSqlFileAsync(cs, "drop-v1-tables.sql");

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(0L, await Count(cs, PublicTables));
        Assert.Equal(1L, await Count(cs, "players.accounts"));
        Assert.Equal(1L, await Count(cs, "infra.import_state WHERE opened_at IS NOT NULL"));

        var again = await database.RunSqlFileAsync(cs, "drop-v1-tables.sql");
        Assert.True(again.ExitCode == 0, again.Output);
    }

    [Fact]
    public async Task BasculePasFaite_Refuse_RienNEstSupprime()
    {
        var cs = await DatabaseAsync(opened: false);

        var result = await database.RunSqlFileAsync(cs, "drop-v1-tables.sql");

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("La v2 n'est pas notée ouverte", result.Output, StringComparison.Ordinal);
        Assert.Equal(11L, await Count(cs, PublicTables));
    }

    [Fact]
    public async Task SansEtatDeLImport_Refuse()
    {
        var cs = await database.CreateDatabaseAsync();

        var result = await database.RunSqlFileAsync(cs, "drop-v1-tables.sql");

        Assert.NotEqual(0, result.ExitCode);
        Assert.Equal(11L, await Count(cs, PublicTables));
    }

    [Fact]
    public async Task TableInconnueDansPublic_Refuse_RienNEstSupprime()
    {
        var cs = await DatabaseAsync(opened: true);
        await ScriptDatabase.ExecuteAsync(cs, """CREATE TABLE public."Badges" ("Id" integer PRIMARY KEY)""");

        var result = await database.RunSqlFileAsync(cs, "drop-v1-tables.sql");

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("Objets inconnus dans public : \"Badges\"", result.Output, StringComparison.Ordinal);
        Assert.Equal(12L, await Count(cs, PublicTables));
    }

    [Fact]
    public async Task DropV1TablesSh_LanceLeScript_ApresLArchiveEnProd()
    {
        var script = await File.ReadAllTextAsync(
            Path.Combine(ScriptDatabase.RepositoryRoot, "deploy", "vps", "drop-v1-tables.sh"), TestContext.Current.CancellationToken);

        var archive = script.IndexOf("./deploy/infra/backup.sh archive", StringComparison.Ordinal);
        var drop = script.IndexOf("< deploy/vps/drop-v1-tables.sql", StringComparison.Ordinal);
        Assert.True(archive >= 0 && drop > archive, "drop-v1-tables.sh doit archiver la prod avant de lancer drop-v1-tables.sql.");
    }

    /// <summary>La base telle que la bascule l'a laissée : tables v1 dans <c>public</c>, un compte v2, l'état de l'import.</summary>
    private async Task<string> DatabaseAsync(bool opened)
    {
        var cs = await database.CreateDatabaseAsync();
        await ScriptDatabase.InsertPlayerAsync(cs, "joueur@example.com", "Joueur");
        await ScriptDatabase.AddImportStateAsync(cs, opened);
        return cs;
    }

    private static Task<long> Count(string cs, string fromWhere) =>
        ScriptDatabase.ScalarAsync<long>(cs, $"SELECT count(*) FROM {fromWhere}");
}
