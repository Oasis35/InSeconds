using InSeconds.Api.Modules.Players.Domain;

namespace InSeconds.MigrationTests;

/// <summary>Partie Players de l'import (§ 8.2, 8.5 et 8.6 du plan v2), par le vrai <c>run-import.sh</c>.</summary>
public class PlayersImportTests(ImportDatabase database)
{
    private static readonly DateTimeOffset Seen = new(2026, 9, 30, 18, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task JoueursEtComptes_RepriseALIdentique()
    {
        var cs = await database.CreateDatabaseAsync();
        var guest = V1Player.Guest() with { LastSeenAt = Seen };
        var guestWithStreak = V1Player.Guest() with { CurrentStreak = 4, LastPlayedDate = new DateOnly(2026, 9, 29), StreakFreezes = 1 };
        var admin = V1Player.Account("admin@example.com", "Admin") with { IsAdmin = true, LastSeenAt = Seen };
        var deleted = V1Player.Account("parti@example.com", "Parti") with { IsDeleted = true, DeletedAt = Seen.AddDays(-1), LastSeenAt = Seen.AddDays(-2) };
        var deletedWithoutDate = V1Player.Guest() with { IsDeleted = true, LastSeenAt = Seen.AddDays(-3) };
        var deletedNeverSeen = V1Player.Guest() with { IsDeleted = true };
        await V1Data.InsertAsync(cs, guest, guestWithStreak, admin, deleted, deletedWithoutDate, deletedNeverSeen);

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Contains("Joueurs supprimés sans date de suppression (date = dernière visite ou création) : 2", result.Output, StringComparison.Ordinal);
        Assert.Equal(6L, await Count(cs, "players.players"));
        Assert.Equal(1L, await Count(cs, $"players.players WHERE id = '{guest.Id}' AND last_seen_at = {V1Data.Sql(Seen)} AND deleted_at IS NULL"));
        Assert.Equal(1L, await Count(cs, $"players.players WHERE id = '{deleted.Id}' AND deleted_at = {V1Data.Sql(Seen.AddDays(-1))}"));
        // Supprimé sans date : la dernière visite, à défaut la création, jamais une date inventée (R16).
        Assert.Equal(1L, await Count(cs, $"players.players WHERE id = '{deletedWithoutDate.Id}' AND deleted_at = {V1Data.Sql(Seen.AddDays(-3))}"));
        Assert.Equal(1L, await Count(cs, $"players.players WHERE id = '{deletedNeverSeen.Id}' AND deleted_at = created_at"));
        // Un compte par joueur non invité, supprimés compris ; rôle admin repris ; date de liaison inconnue.
        Assert.Equal(2L, await Count(cs, "players.accounts WHERE linked_at IS NULL"));
        Assert.Equal(1L, await Count(cs, $"players.accounts WHERE player_id = '{admin.Id}' AND email = 'admin@example.com' AND pseudo = 'Admin' AND is_admin"));
        // Un jeton v1 par joueur, haché exactement comme le cookie v1 sera relu par l'API v2.
        Assert.Equal(6L, await Count(cs, "players.legacy_tokens"));
        Assert.Equal(guest.Id, await ImportDatabase.ScalarAsync<Guid>(cs,
            $"SELECT player_id FROM players.legacy_tokens WHERE token_hash = '\\x{Convert.ToHexStringLower(LegacyToken.HashOf(guest.AuthToken))}'"));
        Assert.Equal(0L, await Count(cs, "players.device_sessions"));
    }

    [Fact]
    public async Task JetonsEnvoyesParEmail_SeulsCeuxEncoreValables()
    {
        var cs = await database.CreateDatabaseAsync();
        var account = V1Player.Account("change@example.com", "Change");
        await V1Data.InsertAsync(cs, account);
        var pending = AuthTokenSecret.Hash("lien-en-cours");
        await V1Data.InsertMagicLinkTokenAsync(cs, "connexion@example.com", pending, "10 minutes");
        await V1Data.InsertMagicLinkTokenAsync(cs, "expire@example.com", AuthTokenSecret.Hash("expire"), "-1 minute");
        await V1Data.InsertMagicLinkTokenAsync(cs, "utilise@example.com", AuthTokenSecret.Hash("utilise"), "10 minutes", consumed: true);
        var emailChange = AuthTokenSecret.Hash("changement-en-cours");
        await V1Data.InsertEmailChangeTokenAsync(cs, account.Id, "nouvelle@example.com", emailChange);

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(2L, await Count(cs, "players.auth_tokens"));
        // Le hash hexadécimal v1 redevient les octets que l'API v2 compare (R14).
        Assert.Equal(1L, await Count(cs,
            $"players.auth_tokens WHERE purpose = 1 AND email = 'connexion@example.com' AND token_hash = '\\x{Convert.ToHexStringLower(pending)}' AND consumed_at IS NULL"));
        Assert.Equal(1L, await Count(cs,
            $"players.auth_tokens WHERE purpose = 2 AND player_id = '{account.Id}' AND new_email = 'nouvelle@example.com' AND token_hash = '\\x{Convert.ToHexStringLower(emailChange)}'"));
    }

    [Fact]
    public async Task ClesDataProtection_CopieesAvecLeursIdentifiants()
    {
        var cs = await database.CreateDatabaseAsync();
        await ImportDatabase.ExecuteAsync(cs, """
            INSERT INTO public."DataProtectionKeys" ("Id", "FriendlyName", "Xml") VALUES
              (3, 'key-a', '<key id="a"/>'), (7, 'key-b', '<key id="b"/>');
            """);

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(1L, await Count(cs, "infra.data_protection_keys WHERE id = 7 AND friendly_name = 'key-b' AND xml = '<key id=\"b\"/>'"));
        // Séquence remise à niveau : la prochaine clé créée par la v2 ne réutilise pas un identifiant.
        await ImportDatabase.ExecuteAsync(cs, "INSERT INTO infra.data_protection_keys (friendly_name, xml) VALUES ('nouvelle', '<key/>')");
        Assert.Equal(8, await ImportDatabase.ScalarAsync<int>(cs, "SELECT id FROM infra.data_protection_keys WHERE friendly_name = 'nouvelle'"));
    }

    [Fact]
    public async Task Rejouable_MemeResultat_EtImportNote()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertAsync(cs, V1Player.Guest(), V1Player.Account("compte@example.com", "Compte"));

        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        // Entre deux imports, la v2 a pu ouvrir des sessions d'appareil : l'import repart de zéro.
        var playerId = await ImportDatabase.ScalarAsync<Guid>(cs, "SELECT id FROM players.players LIMIT 1");
        await ImportDatabase.ExecuteAsync(cs, $"INSERT INTO players.device_sessions (id, player_id, created_at, last_seen_at) VALUES (999, '{playerId}', now(), now())");
        var second = await database.RunImportAsync(cs);

        Assert.True(second.ExitCode == 0, second.Output);
        Assert.Equal(2L, await Count(cs, "players.players"));
        Assert.Equal(1L, await Count(cs, "players.accounts"));
        Assert.Equal(0L, await Count(cs, "players.device_sessions"));
        Assert.Equal(1L, await Count(cs, "infra.import_state WHERE imported_at IS NOT NULL AND opened_at IS NULL"));
    }

    [Fact]
    public async Task PseudosEnDoublonDeCasse_ImportRefuse_RienNEstGarde()
    {
        var cs = await database.CreateDatabaseAsync();
        var bob = V1Player.Account("bob1@example.com", "Bob");
        var bob2 = V1Player.Account("bob2@example.com", "bob");
        await V1Data.InsertAsync(cs, bob, bob2, V1Player.Guest());

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("Pseudos en doublon de casse", result.Output, StringComparison.Ordinal);
        Assert.Contains(bob.Id.ToString(), result.Output, StringComparison.Ordinal);
        // Les identifiants seulement, jamais les pseudos (S13).
        Assert.DoesNotContain("Bob", result.Output.Replace("« Bob » et « bob »", "", StringComparison.Ordinal), StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "players.players"));
        Assert.Equal(0L, await ImportDatabase.ScalarAsync<long>(cs, "SELECT count(*) FROM pg_tables WHERE schemaname = 'infra' AND tablename = 'import_state'"));
    }

    [Fact]
    public async Task CompteSansEmail_ImportRefuse()
    {
        var cs = await database.CreateDatabaseAsync();
        var noEmail = V1Player.Account("x@example.com", "SansEmail") with { Email = null };
        await V1Data.InsertAsync(cs, noEmail);

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains($"Comptes v1 sans adresse email, joueurs : {noEmail.Id}", result.Output, StringComparison.Ordinal);
    }

    [Fact]
    public async Task EmailsEnDoublonDeCasse_ImportRefuse()
    {
        // L'index unique de la v1 respecte la casse : les deux adresses y cohabitent. La colonne v2 est en citext.
        var cs = await database.CreateDatabaseAsync();
        var first = V1Player.Account("Doublon@example.com", "Premier");
        var second = V1Player.Account("doublon@example.com", "Second");
        await V1Data.InsertAsync(cs, first, second, V1Player.Guest());

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("Adresses email en doublon de casse", result.Output, StringComparison.Ordinal);
        Assert.Contains(first.Id.ToString(), result.Output, StringComparison.Ordinal);
        Assert.Contains(second.Id.ToString(), result.Output, StringComparison.Ordinal);
        // Les identifiants seulement, jamais les adresses (S13).
        Assert.DoesNotContain("doublon@example.com", result.Output, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0L, await Count(cs, "players.players"));
    }

    [Fact]
    public async Task Verification_DetecteUnEcart_EtAnnuleTout()
    {
        var cs = await database.CreateDatabaseAsync();
        var admin = V1Player.Account("admin@example.com", "Admin") with { IsAdmin = true };
        await V1Data.InsertAsync(cs, admin);

        var error = await ImportWithTamperingAsync(cs, $"UPDATE players.accounts SET is_admin = false WHERE player_id = '{admin.Id}';");

        Assert.Contains("comptes repris à l'identique", error.MessageText, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "players.players"));
    }

    [Theory]
    [InlineData("UPDATE players.auth_tokens SET email = 'autre@example.com' WHERE purpose = 1;", "jetons de connexion repris à l'identique")]
    [InlineData("UPDATE players.auth_tokens SET expires_at = expires_at + interval '1 hour' WHERE purpose = 1;", "jetons de connexion repris à l'identique")]
    [InlineData("UPDATE players.auth_tokens SET new_email = 'autre@example.com' WHERE purpose = 2;", "jetons de changement d'email repris à l'identique")]
    [InlineData("UPDATE players.auth_tokens SET expires_at = expires_at + interval '1 hour' WHERE purpose = 2;", "jetons de changement d'email repris à l'identique")]
    public async Task Verification_DetecteUnJetonAltere_EtAnnuleTout(string tampering, string expectedCheck)
    {
        var cs = await database.CreateDatabaseAsync();
        var account = V1Player.Account("jeton@example.com", "Jeton");
        await V1Data.InsertAsync(cs, account);
        await V1Data.InsertMagicLinkTokenAsync(cs, "connexion@example.com", AuthTokenSecret.Hash("lien"), "10 minutes");
        await V1Data.InsertEmailChangeTokenAsync(cs, account.Id, "nouvelle@example.com", AuthTokenSecret.Hash("changement"));

        var error = await ImportWithTamperingAsync(cs, tampering);

        Assert.Contains(expectedCheck, error.MessageText, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "players.players"));
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

    [Fact]
    public async Task RunImport_EnchaineLesScriptsDansLOrdre()
    {
        var runImport = await File.ReadAllTextAsync(Path.Combine(ImportDatabase.RepositoryRoot, "deploy", "migration-v2", "run-import.sh"), TestContext.Current.CancellationToken);

        var files = System.Text.RegularExpressions.Regex.Matches(runImport, @"\$dir/([\w-]+\.sql)").Select(m => m.Groups[1].Value);

        Assert.Equal(["00-import-state.sql", "05-check-source.sql", "10-import.sql", "20-verify.sql", "90-import-done.sql"], files);
        Assert.Contains("--single-transaction", runImport, StringComparison.Ordinal);
        Assert.Contains("ON_ERROR_STOP=1", runImport, StringComparison.Ordinal);
    }

    private static Task<long> Count(string cs, string fromWhere) =>
        ImportDatabase.ScalarAsync<long>(cs, $"SELECT count(*) FROM {fromWhere}");
}
