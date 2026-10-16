using Microsoft.Extensions.Time.Testing;

namespace InSeconds.MigrationTests;

/// <summary>
/// Anonymisation du staging (<c>staging-anonymize.sql</c>, S8 et § 10.1 du plan v2), lancée par <c>copy-prod-db-to-staging.sh</c>
/// après la copie des schémas v2 de la prod (I1, #235) : aucune adresse ni aucun rôle admin de la prod ne reste, sauf ceux de l'adresse gardée, et la file de Wolverine est vidée,
/// messages en erreur compris (ils gardent le corps du message, une adresse pour un lien de connexion).
/// </summary>
public class StagingAnonymizeTests(ImportDatabase database)
{
    private static readonly string[] Queues = ["wolverine_incoming_envelopes", "wolverine_outgoing_envelopes", "wolverine_dead_letters"];

    [Fact]
    public async Task ComptesEtJetonsAnonymises_AdresseGardee_FileDeWolverineVidee()
    {
        var cs = await database.CreateDatabaseAsync();
        var kept = V1Player.Account("Garde@example.com", "Garde") with { IsAdmin = true };
        var other = V1Player.Account("joueur@example.com", "Joueur") with { IsAdmin = true };
        await V1Data.InsertAsync(cs, kept, other, V1Player.Guest());
        await V1Data.InsertMagicLinkTokenAsync(cs, "joueur@example.com", [1, 2, 3], "10 minutes");
        await ImportDatabase.ExecuteAsync(cs, """INSERT INTO public."DataProtectionKeys" ("Id", "FriendlyName", "Xml") VALUES (1, 'key', '<key/>')""");
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        // Les tables de messaging : créées par Wolverine au premier démarrage de l'API (pas par les migrations), noms compris.
        await using (var api = new V2Api(cs, new FakeTimeProvider(DateTimeOffset.UtcNow)))
            (await api.CreateClient().GetAsync("/health", TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        await ImportDatabase.ExecuteAsync(cs, """
            INSERT INTO messaging.wolverine_incoming_envelopes (id, status, owner_id, body, message_type) VALUES (gen_random_uuid(), 'Incoming', 0, '\x01', 'm');
            INSERT INTO messaging.wolverine_outgoing_envelopes (id, owner_id, destination, body, message_type) VALUES (gen_random_uuid(), 0, 'local://x', '\x01', 'm');
            INSERT INTO messaging.wolverine_dead_letters (id, body, message_type) VALUES (gen_random_uuid(), '\x01', 'm');
            """);

        var result = await database.RunSqlFileAsync(cs, "staging-anonymize.sql", "keep=garde@example.com");

        Assert.True(result.ExitCode == 0, result.Output);
        // L'adresse gardée (STAGING_KEEP_EMAIL, sans tenir compte de la casse) garde aussi son rôle admin : celui qui teste le staging.
        Assert.Equal(1L, await Count(cs, $"players.accounts WHERE player_id = '{kept.Id}' AND email = 'Garde@example.com' AND is_admin"));
        Assert.Equal(1L, await Count(cs, $"players.accounts WHERE player_id = '{other.Id}' AND email = 'player-{other.Id}@example.invalid' AND NOT is_admin"));
        foreach (var table in new[] { "players.auth_tokens", "players.device_sessions", "players.legacy_tokens", "infra.data_protection_keys" })
            Assert.Equal(0L, await Count(cs, table));
        foreach (var queue in Queues)
            Assert.Equal(0L, await Count(cs, $"messaging.{queue}"));
    }

    [Fact]
    public async Task ApiJamaisDemarree_SansTablesDeWolverine_Passe()
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertAsync(cs, V1Player.Account("joueur@example.com", "Joueur"));
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);

        var result = await database.RunSqlFileAsync(cs, "staging-anonymize.sql", "keep=garde@example.com");

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(0L, await Count(cs, "players.accounts WHERE email::text NOT LIKE '%@example.invalid'"));
    }

    [Fact]
    public async Task CopieProdVersStaging_LanceLeScript_EnvoyeParLeWorkflow()
    {
        var ct = TestContext.Current.CancellationToken;
        var copy = await File.ReadAllTextAsync(Path.Combine(ImportDatabase.RepositoryRoot, "deploy", "vps", "copy-prod-db-to-staging.sh"), ct);
        var workflow = await File.ReadAllTextAsync(Path.Combine(ImportDatabase.RepositoryRoot, ".github", "workflows", "staging-db-copy.yml"), ct);

        Assert.Contains("-v keep=\"$keep_email\" < \"$ANONYMIZE_SQL\"", copy, StringComparison.Ordinal);
        // Les clés Data Protection de la prod ne sont jamais copiées.
        Assert.Contains("-T infra.data_protection_keys", copy, StringComparison.Ordinal);
        Assert.Contains("< deploy/migration-v2/staging-anonymize.sql", workflow, StringComparison.Ordinal);
        Assert.Contains("STAGING_ANONYMIZE_SQL=$HOME/inseconds-staging-anonymize.sql bash -s", workflow, StringComparison.Ordinal);
    }

    private static Task<long> Count(string cs, string fromWhere) =>
        ImportDatabase.ScalarAsync<long>(cs, $"SELECT count(*) FROM {fromWhere}");
}
