using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace InSeconds.MigrationTests;

/// <summary>
/// Import complet (PR G1, § 8.4 à 8.6 du plan v2) : contrôle de la forme de la source, garde <c>opened_at</c> / <c>--force</c>,
/// réglages, statistiques figées de l'historique vérifiées, et l'enchaînement complet d'un bloc. Par le vrai <c>run-import.sh</c>.
/// </summary>
public class CompleteImportTests(ImportDatabase database)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    // ---------------------------------------------------------------------------------------------
    // Forme de la source
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task FormeDeLaSource_SchemaGenereDepuisLeCodeV1_Acceptee()
    {
        // Le schéma de la base de test vient du code v1 actuel (dotnet ef migrations script) : une migration v1 ajoutée
        // sans mettre à jour 05-check-source.sql fait échouer ce test, avant le staging.
        var cs = await database.CreateDatabaseAsync();

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
    }

    [Theory]
    [InlineData("""ALTER TABLE public."Players" ADD COLUMN "Avatar" text""", "Players.Avatar : inconnue de l'import")]
    [InlineData("""CREATE TABLE public."Badges" ("Id" integer PRIMARY KEY)""", "Badges.Id : inconnue de l'import")]
    [InlineData("""ALTER TABLE public."DailyChallengeTracks" DROP COLUMN "DeezerRankSnapshot" """, "DailyChallengeTracks.DeezerRankSnapshot : absente")]
    [InlineData("""ALTER TABLE public."Tracks" ALTER COLUMN "ReleaseYear" TYPE bigint""", "Tracks.ReleaseYear : bigint NULL au lieu de integer NULL")]
    [InlineData("""ALTER TABLE public."GameSessions" ALTER COLUMN "CurrentTrackId" SET NOT NULL""", "GameSessions.CurrentTrackId : integer au lieu de integer NULL")]
    public async Task FormeDeLaSource_MigrationV1PendantLeChantier_ImportRefuse_EcartNomme(string migration, string expectedGap)
    {
        var cs = await database.CreateDatabaseAsync();
        await ImportDatabase.ExecuteAsync(cs, migration);

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("La forme des tables v1 (schéma public) n'est pas celle que l'import connaît", result.Output, StringComparison.Ordinal);
        Assert.Contains(expectedGap, result.Output, StringComparison.Ordinal);
        // Rien n'est importé, l'état de l'import n'est pas noté : la transaction annulée emporte jusqu'à sa table.
        Assert.Null(await ImportDatabase.ScalarAsync<string>(cs, "SELECT to_regclass('infra.import_state')::text"));
    }

    // ---------------------------------------------------------------------------------------------
    // Garde opened_at / --force
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Garde_ApresOuverture_ImportRefuseSansForce_RienNEstEfface()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertAsync(cs, V1Player.Guest());
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        Assert.Equal(0, (await database.RunSqlFileAsync(cs, "mark-opened.sql")).ExitCode);
        // Un joueur né en v2, après l'ouverture : un nouvel import l'effacerait.
        await ImportDatabase.ExecuteAsync(cs, "INSERT INTO players.players (id, created_at) VALUES ('11111111-1111-1111-1111-111111111111', now())");

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("La v2 est ouverte aux joueurs depuis le", result.Output, StringComparison.Ordinal);
        Assert.Contains("run-import.sh --force", result.Output, StringComparison.Ordinal);
        Assert.Equal(2L, await Count(cs, "players.players"));
    }

    [Fact]
    public async Task Garde_AvecForce_ImportRejoue_DateDOuvertureGardee()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertAsync(cs, V1Player.Guest());
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        Assert.Equal(0, (await database.RunSqlFileAsync(cs, "mark-opened.sql")).ExitCode);
        var opened = await ImportDatabase.ScalarAsync<DateTime>(cs, "SELECT opened_at FROM infra.import_state");
        await ImportDatabase.ExecuteAsync(cs, "INSERT INTO players.players (id, created_at) VALUES ('11111111-1111-1111-1111-111111111111', now())");

        var result = await database.RunImportAsync(cs, "--force");

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Contains("Import forcé (--force) alors que la v2 est ouverte", result.Output, StringComparison.Ordinal);
        // La v2 est remise dans l'état de la v1 ; elle reste ouverte (la garde vaut pour le prochain import aussi).
        Assert.Equal(1L, await Count(cs, "players.players"));
        Assert.Equal(opened, await ImportDatabase.ScalarAsync<DateTime>(cs, "SELECT opened_at FROM infra.import_state"));
    }

    [Fact]
    public async Task Garde_AvantOuverture_ImportRejouableSansForce()
    {
        var cs = await database.CreateDatabaseAsync();
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(1L, await Count(cs, "infra.import_state WHERE opened_at IS NULL"));
    }

    [Fact]
    public async Task Garde_OptionInconnue_Refusee()
    {
        var cs = await database.CreateDatabaseAsync();

        var result = await database.RunImportAsync(cs, "--forcer");

        Assert.Equal(2, result.ExitCode);
        Assert.Contains("Option inconnue : --forcer", result.Output, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Ouverture_SansImport_Refusee_PuisRejouable_PremiereDateGardee()
    {
        var cs = await database.CreateDatabaseAsync();

        var refused = await database.RunSqlFileAsync(cs, "mark-opened.sql");
        Assert.NotEqual(0, refused.ExitCode);
        Assert.Contains("Aucun import réussi n'est noté", refused.Output, StringComparison.Ordinal);

        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        Assert.Equal(0, (await database.RunSqlFileAsync(cs, "mark-opened.sql")).ExitCode);
        var opened = await ImportDatabase.ScalarAsync<DateTime>(cs, "SELECT opened_at FROM infra.import_state");
        Assert.Equal(0, (await database.RunSqlFileAsync(cs, "mark-opened.sql")).ExitCode);
        Assert.Equal(opened, await ImportDatabase.ScalarAsync<DateTime>(cs, "SELECT opened_at FROM infra.import_state"));
    }

    // ---------------------------------------------------------------------------------------------
    // Réglages
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Reglages_ValeursParDefautDeLaV1_RepriseEnJson_ClesPrefixees()
    {
        // La base de test a les onze réglages que les migrations v1 insèrent.
        var cs = await database.CreateDatabaseAsync();

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Contains("Réglages repris : 11", result.Output, StringComparison.Ordinal);
        Assert.Equal(11L, await Count(cs, "infra.settings"));
        Assert.Equal("20", await Setting(cs, "Daily:GuessTimerSeconds"));
        Assert.Equal("[0.5, 1, 1.5, 2, 3, 5, 10]", await Setting(cs, "Daily:AllowedDurationsSeconds"));
        Assert.Equal(
            """[{"score": 1000, "seconds": 0.5}, {"score": 850, "seconds": 1}, {"score": 700, "seconds": 1.5}, {"score": 550, "seconds": 2}, {"score": 400, "seconds": 3}, {"score": 250, "seconds": 5}, {"score": 100, "seconds": 10}]""",
            await Setting(cs, "Daily:DurationScores"));
        Assert.Equal("""{"1": 30, "2": 60}""", await Setting(cs, "Daily:HintPenaltyPercent"));
        Assert.Equal("[5, 10]", await Setting(cs, "Daily:HintUnlockDurationsSeconds"));
        Assert.Equal("\"https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg\"", await Setting(cs, "Catalogue:CoverUrlTemplate"));
        Assert.Equal(1L, await Count(cs, "infra.settings WHERE key = 'Daily:TrackCooldownDays' AND description LIKE 'Nombre de jours%'"));

        // Relus par l'API v2 : ses valeurs par défaut, qui sont celles de la v1.
        var (daily, catalogue) = ReadOptions(cs);
        Assert.Equal(DailyOptions.DefaultAllowedDurationsSeconds, daily.EffectiveAllowedDurationsSeconds);
        Assert.Equal(DailyOptions.DefaultDurationScores, daily.EffectiveDurationScores);
        Assert.Equal(DailyOptions.DefaultHintPenaltyPercent, daily.EffectiveHintPenaltyPercent);
        Assert.Equal(DailyOptions.DefaultHintUnlockDurationsSeconds, daily.EffectiveHintUnlockDurationsSeconds);
        Assert.Equal(new CatalogueOptions().CoverUrlTemplate, catalogue.CoverUrlTemplate);
    }

    [Fact]
    public async Task Reglages_ValeursModifieesEnProd_RelusParLApiV2AlIdentique()
    {
        var cs = await database.CreateDatabaseAsync();
        // Ce que la prod peut avoir : le cooldown changé depuis l'admin (40 en prod au 09/10), et des listes écrites à la main
        // (espaces, zéros inutiles, élément vide), que la v1 lisait sans broncher.
        await SetV1(cs, "TrackCooldownDays", "40");
        await SetV1(cs, "TracksPerChallenge", " 6 ");
        await SetV1(cs, "GuessTimerSeconds", "25");
        await SetV1(cs, "AllowedDurationsSeconds", "0.50, 1 ,2,,4");
        await SetV1(cs, "DurationScores", "0.50:900, 1:800,2:500,4:200");
        await SetV1(cs, "HintUnlockDurationsSeconds", "2,4");
        await SetV1(cs, "HintPenaltyPercent", "1:25, 2:50");
        await SetV1(cs, "StreakFreezeEveryDays", "5");
        await SetV1(cs, "StreakFreezeMax", "3");
        await SetV1(cs, "StreakLostNudgeMinDays", "4");
        await SetV1(cs, "CoverUrlTemplate", "https://cdn.example/{hash}/500x500.jpg");

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        var (daily, catalogue) = ReadOptions(cs);
        Assert.Equal(40, daily.EffectiveTrackCooldownDays);
        Assert.Equal(6, daily.EffectiveTracksPerChallenge);
        Assert.Equal(25, daily.GuessTimerSeconds);
        Assert.Equal([0.5m, 1m, 2m, 4m], daily.EffectiveAllowedDurationsSeconds);
        Assert.Equal([new DurationScore(0.5m, 900), new DurationScore(1m, 800), new DurationScore(2m, 500), new DurationScore(4m, 200)], daily.EffectiveDurationScores);
        Assert.Equal([2m, 4m], daily.EffectiveHintUnlockDurationsSeconds);
        Assert.Equal(new Dictionary<int, int> { [1] = 25, [2] = 50 }, daily.EffectiveHintPenaltyPercent);
        Assert.Equal(new StreakRules(5, 3, 4), daily.StreakRules);
        Assert.Equal("https://cdn.example/{hash}/500x500.jpg", catalogue.CoverUrlTemplate);
        // Et ces réglages passent le contrôle du démarrage de l'API.
        Assert.Empty(DailyOptionsChecks.Problems(daily, maxHintLevel: 2));
    }

    [Fact]
    public async Task Reglages_Rejouable_ReglageChangeEnV2Remplace_ReglagePropreALaV2Garde()
    {
        var cs = await database.CreateDatabaseAsync();
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        // Sur le staging : le cooldown changé depuis l'admin v2, et un réglage que la v1 n'a pas.
        await ImportDatabase.ExecuteAsync(cs, """
            UPDATE infra.settings SET value = '45' WHERE key = 'Daily:TrackCooldownDays';
            INSERT INTO infra.settings (key, value, updated_at) VALUES ('Catalogue:Refresh:BatchSize', '5', now());
            """);

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal("30", await Setting(cs, "Daily:TrackCooldownDays"));
        Assert.Equal("5", await Setting(cs, "Catalogue:Refresh:BatchSize"));
        Assert.Equal(12L, await Count(cs, "infra.settings"));
    }

    [Fact]
    public async Task Reglages_CleInconnue_ImportRefuse_CleNommee()
    {
        var cs = await database.CreateDatabaseAsync();
        await ImportDatabase.ExecuteAsync(cs, """
            INSERT INTO public."Settings" ("Id", "Key", "Value", "UpdatedAt") VALUES (99, 'MaxDailyPlays', '5', now())
            """);

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("Réglages v1 inconnus de l'import (à ajouter à import_setting_map, ou à retirer de la v1) : MaxDailyPlays", result.Output, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "infra.settings"));
    }

    [Theory]
    [InlineData("TrackCooldownDays", "trente")]
    [InlineData("TrackCooldownDays", "99999999999")]
    [InlineData("AllowedDurationsSeconds", "")]
    [InlineData("AllowedDurationsSeconds", "1,deux,3")]
    [InlineData("DurationScores", "1:1000,2")]
    [InlineData("DurationScores", "1:1000,1:900")]
    [InlineData("HintPenaltyPercent", "1:30,1.5:60")]
    public async Task Reglages_ValeurIllisible_ImportRefuse_CleNommee(string key, string value)
    {
        // La v1 ignorait sans bruit une entrée illisible et retombait sur ses valeurs par défaut : l'import le dit.
        var cs = await database.CreateDatabaseAsync();
        await SetV1(cs, key, value);

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains($"Réglages v1 dont la valeur ne se convertit pas sans perte (format attendu : voir import_setting_map) : {key}", result.Output, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("DELETE FROM infra.settings WHERE key = 'Daily:StreakFreezeMax';", "Vérification « réglages »")]
    [InlineData("UPDATE infra.settings SET value = '31' WHERE key = 'Daily:TrackCooldownDays';", "réglages repris à l'identique")]
    [InlineData("UPDATE infra.settings SET value = '\"30\"' WHERE key = 'Daily:TrackCooldownDays';", "réglages repris à l'identique")]
    [InlineData("UPDATE infra.settings SET value = '[0.5, 1, 2, 1.5, 3, 5, 10]' WHERE key = 'Daily:AllowedDurationsSeconds';", "réglages repris à l'identique")]
    [InlineData("UPDATE infra.settings SET value = jsonb_set(value, '{0,score}', '999') WHERE key = 'Daily:DurationScores';", "réglages repris à l'identique")]
    [InlineData("UPDATE infra.settings SET value = '{\"1\": 30, \"2\": 61}' WHERE key = 'Daily:HintPenaltyPercent';", "réglages repris à l'identique")]
    [InlineData("UPDATE infra.settings SET value = '\"https://x/{hash}\"' WHERE key = 'Catalogue:CoverUrlTemplate';", "réglages repris à l'identique")]
    [InlineData("UPDATE infra.settings SET description = NULL WHERE key = 'Daily:GuessTimerSeconds';", "réglages repris à l'identique")]
    [InlineData("UPDATE infra.settings SET updated_at = now() WHERE key = 'Daily:GuessTimerSeconds';", "réglages repris à l'identique")]
    public async Task Reglages_Verification_DetecteUnEcart(string tampering, string expectedCheck)
    {
        var cs = await database.CreateDatabaseAsync();

        var error = await ImportDatabase.ImportWithTamperingAsync(cs, tampering);

        Assert.Contains(expectedCheck, error.MessageText, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "infra.settings"));
    }

    // ---------------------------------------------------------------------------------------------
    // Statistiques figées de l'historique, et l'import complet d'un bloc
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task ImportComplet_DUnBloc_ImportPuisPhotosPuisVerification_SansEcart()
    {
        var cs = await database.CreateDatabaseAsync();
        await SeedHistoryAsync(cs);
        // Paliers changés en prod : la photo doit figer ceux-là, pas ceux par défaut.
        await SetV1(cs, "AllowedDurationsSeconds", "0.50,1,2,4");
        await SetV1(cs, "DurationScores", "0.50:900,1:800,2:500,4:200");

        var import = await database.RunImportAsync(cs);
        Assert.True(import.ExitCode == 0, import.Output);
        Assert.Equal(0, await FreezeDayStatsCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={cs}"], TestContext.Current.CancellationToken));

        var verify = await database.RunSqlFileAsync(cs, "30-verify-day-stats.sql");

        Assert.True(verify.ExitCode == 0, verify.Output);
        Assert.Contains("Statistiques figées vérifiées : 2 jour(s).", verify.Output, StringComparison.Ordinal);
        Assert.Equal(1L, await Count(cs, "daily.challenge_day_stats WHERE challenge_id = 1 AND payload -> 'allowedDurationsSeconds' = '[0.5, 1, 2, 4]'"));
    }

    [Fact]
    public async Task StatistiquesFigees_JourSansPhoto_VerificationRefuse_DateNommee()
    {
        var cs = await database.CreateDatabaseAsync();
        await SeedHistoryAsync(cs);
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);

        // Sans --freeze-day-stats : aucune photo.
        var verify = await database.RunSqlFileAsync(cs, "30-verify-day-stats.sql");

        Assert.NotEqual(0, verify.ExitCode);
        Assert.Contains("Vérification « jours terminés avec leur photo » : 2 attendu(s), 0 trouvé(s)", verify.Output, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("""UPDATE daily.challenge_day_stats SET payload = jsonb_set(payload, '{playerCount}', '7') WHERE challenge_id = 1""", "photos conformes à la v1")]
    [InlineData("""UPDATE daily.challenge_day_stats SET payload = jsonb_set(payload, '{expiredCount}', '0') WHERE challenge_id = 1""", "photos conformes à la v1")]
    [InlineData("""UPDATE daily.challenge_day_stats SET payload = jsonb_set(payload, '{scoreMax}', '1') WHERE challenge_id = 2""", "photos conformes à la v1")]
    [InlineData("""UPDATE daily.challenge_day_stats SET payload = jsonb_set(payload, '{allowedDurationsSeconds}', '[1, 2]') WHERE challenge_id = 2""", "photos figées avec les paliers des réglages importés")]
    [InlineData("""UPDATE daily.challenge_day_stats SET version = 2 WHERE challenge_id = 2""", "jours terminés avec leur photo")]
    public async Task StatistiquesFigees_PhotoQuiDiffereDeLaV1_VerificationRefuse(string tampering, string expectedCheck)
    {
        var cs = await database.CreateDatabaseAsync();
        await SeedHistoryAsync(cs);
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        Assert.Equal(0, await FreezeDayStatsCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={cs}"], TestContext.Current.CancellationToken));
        await ImportDatabase.ExecuteAsync(cs, tampering);

        var verify = await database.RunSqlFileAsync(cs, "30-verify-day-stats.sql");

        Assert.NotEqual(0, verify.ExitCode);
        Assert.Contains(expectedCheck, verify.Output, StringComparison.Ordinal);
    }

    /// <summary>
    /// Un historique de tous les modules : deux jours terminés (J-10 : une partie terminée, une abandonnée, une restée en cours, une d'un
    /// joueur supprimé ; J-5 : deux parties terminées), la veille (en cours, jamais figée), un compte, un jeton de connexion, une clé.
    /// </summary>
    private static async Task SeedHistoryAsync(string cs)
    {
        var (a, b, c) = (V1Player.Account("a@example.com", "Alice") with { CurrentStreak = 2, LastPlayedDate = Today.AddDays(-5), StreakFreezes = 1 },
            V1Player.Guest(), V1Player.Guest());
        var gone = V1Player.Guest() with { IsDeleted = true };
        await V1Data.InsertAsync(cs, a, b, c, gone);
        await ImportDatabase.ExecuteAsync(cs, """INSERT INTO public."DataProtectionKeys" ("Id", "FriendlyName", "Xml") VALUES (1, 'k', '<key/>')""");

        var days = new[] { Today.AddDays(-10), Today.AddDays(-5), Today.AddDays(-1) };
        for (var i = 0; i < days.Length; i++)
        {
            await V1Data.InsertTracksAsync(cs, new V1Track(i + 1, 301 + i) { LastUsedDate = days[i], UsageCount = 1 });
            await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(i + 1, days[i]));
            await V1DailyData.InsertChallengeTracksAsync(cs, new V1ChallengeTrack(100 + i, i + 1, i + 1, 1));
        }

        var started = new DateTimeOffset(days[0].ToDateTime(TimeOnly.MinValue), TimeSpan.Zero).AddHours(9);
        await V1DailyData.InsertSessionsAsync(cs,
            new V1Session(1, a.Id, 1) { Status = 1, CreatedAt = started, CompletedAt = started.AddMinutes(3), TotalScore = 850, TotalDurationSeconds = 1m },
            new V1Session(2, b.Id, 1) { Status = 2, CreatedAt = started, AbandonedAt = started.AddMinutes(1) },
            new V1Session(3, c.Id, 1) { CreatedAt = started },
            new V1Session(4, gone.Id, 1) { Status = 1, CreatedAt = started, CompletedAt = started.AddMinutes(3), TotalScore = 850, TotalDurationSeconds = 1m },
            new V1Session(5, a.Id, 2) { Status = 1, CreatedAt = started.AddDays(5), CompletedAt = started.AddDays(5).AddMinutes(3), TotalScore = 900, TotalDurationSeconds = 0.5m },
            new V1Session(6, b.Id, 2) { Status = 1, CreatedAt = started.AddDays(5), CompletedAt = started.AddDays(5).AddMinutes(3), TotalScore = 200, TotalDurationSeconds = 4m },
            new V1Session(7, c.Id, 3) { CreatedAt = started.AddDays(9) });
        await V1DailyData.InsertAnswersAsync(cs,
            new V1Answer(1, 1, 100),
            new V1Answer(2, 4, 100),
            new V1Answer(3, 5, 101) { ListenedDurationSeconds = 0.5m, Score = 900 },
            new V1Answer(4, 6, 101) { ListenedDurationSeconds = 4m, Score = 200 });
    }

    private static async Task SetV1(string cs, string key, string value)
    {
        await using var connection = new NpgsqlConnection(cs);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("""UPDATE public."Settings" SET "Value" = @value WHERE "Key" = @key""", connection);
        command.Parameters.AddWithValue("key", key);
        command.Parameters.AddWithValue("value", value);
        Assert.Equal(1, await command.ExecuteNonQueryAsync());
    }

    /// <summary>Les réglages tels que l'API v2 les lit : la vraie source de configuration de <c>infra.settings</c>, puis le binder.</summary>
    private static (DailyOptions Daily, CatalogueOptions Catalogue) ReadOptions(string cs)
    {
        var configuration = new ConfigurationBuilder().Add(new DatabaseSettingsConfigurationSource(cs)).Build();
        return (configuration.GetSection(DailyOptions.Section).Get<DailyOptions>() ?? new DailyOptions(),
            configuration.GetSection(CatalogueOptions.Section).Get<CatalogueOptions>() ?? new CatalogueOptions());
    }

    private static Task<string?> Setting(string cs, string key) =>
        ImportDatabase.ScalarAsync<string>(cs, $"SELECT value::text FROM infra.settings WHERE key = '{key}'");

    private static Task<long> Count(string cs, string fromWhere) =>
        ImportDatabase.ScalarAsync<long>(cs, $"SELECT count(*) FROM {fromWhere}");
}
