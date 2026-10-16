namespace InSeconds.MigrationTests;

/// <summary>
/// Anonymisation du staging (<c>deploy/vps/staging-anonymize.sql</c>, S8 et § 10.1 du plan v2), lancée par <c>copy-prod-db-to-staging.sh</c>
/// après la copie des schémas v2 de la prod (I1, #235) : aucune adresse ni aucun rôle admin de la prod ne reste, sauf ceux de l'adresse
/// gardée, les pseudos sont remplacés, le texte des réponses saisies est effacé (verdicts et scores gardés), et la file de Wolverine est vidée, messages en erreur compris (ils gardent le corps du message, une adresse pour un lien de connexion).
/// </summary>
public class StagingAnonymizeTests(ScriptDatabase database)
{
    private static readonly string[] Queues = ["wolverine_incoming_envelopes", "wolverine_outgoing_envelopes", "wolverine_dead_letters"];

    [Fact]
    public async Task ComptesEtJetonsAnonymises_AdresseGardee_FileDeWolverineVidee()
    {
        var cs = await database.CreateDatabaseAsync();
        var kept = await ScriptDatabase.InsertPlayerAsync(cs, "Garde@example.com", "Garde", isAdmin: true);
        var other = await ScriptDatabase.InsertPlayerAsync(cs, "joueur@example.com", "Joueur", isAdmin: true);
        await ScriptDatabase.InsertPlayerAsync(cs);
        await ScriptDatabase.ExecuteAsync(cs, $"""
            INSERT INTO players.auth_tokens (created_at, email, expires_at, purpose, token_hash) VALUES (now(), 'joueur@example.com', now() + interval '10 minutes', 1, '\x010203');
            INSERT INTO players.device_sessions (id, created_at, last_seen_at, player_id) VALUES (1, now(), now(), '{other}');
            INSERT INTO players.legacy_tokens (player_id, token_hash) VALUES ('{other}', '\x01');
            INSERT INTO infra.data_protection_keys (friendly_name, xml) VALUES ('key', '<key/>');
            INSERT INTO daily.challenges (id, date, seed) VALUES (1, '2026-10-01', 1);
            INSERT INTO daily.sessions (id, challenge_id, player_id, started_at, status, total_listened_seconds, total_score, current_hint_level, freezes_used, freeze_earned)
                VALUES (1, 1, '{other}', now(), 1, 1, 850, 0, 0, false);
            INSERT INTO daily.answers (session_id, position, answered_at, artist_answer, title_answer, artist_correct, title_correct, hint_level, listened_seconds, score, was_extended)
                VALUES (1, 1, now(), 'Ce que tape un joueur', 'Un titre', true, false, 0, 1, 850, false);
            """);
        // Les tables de messaging : créées par Wolverine au premier démarrage de l'API (pas par les migrations), noms compris.
        await using (var api = new TestApi(cs))
            (await api.CreateClient().GetAsync("/health", TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        await ScriptDatabase.ExecuteAsync(cs, """
            INSERT INTO messaging.wolverine_incoming_envelopes (id, status, owner_id, body, message_type) VALUES (gen_random_uuid(), 'Incoming', 0, '\x01', 'm');
            INSERT INTO messaging.wolverine_outgoing_envelopes (id, owner_id, destination, body, message_type) VALUES (gen_random_uuid(), 0, 'local://x', '\x01', 'm');
            INSERT INTO messaging.wolverine_dead_letters (id, body, message_type) VALUES (gen_random_uuid(), '\x01', 'm');
            """);

        var result = await database.RunSqlFileAsync(cs, "staging-anonymize.sql", "keep=garde@example.com");

        Assert.True(result.ExitCode == 0, result.Output);
        // L'adresse gardée (STAGING_KEEP_EMAIL, sans tenir compte de la casse) garde aussi son rôle admin : celui qui teste le staging.
        Assert.Equal(1L, await Count(cs, $"players.accounts WHERE player_id = '{kept}' AND email = 'Garde@example.com' AND pseudo = 'Garde' AND is_admin"));
        var pseudo = "joueur-" + other.ToString("N")[..12];
        Assert.Equal(1L, await Count(cs, $"players.accounts WHERE player_id = '{other}' AND email = 'player-{other}@example.invalid' AND pseudo = '{pseudo}' AND NOT is_admin"));
        Assert.Equal(0L, await Count(cs, "players.accounts WHERE pseudo = 'Joueur'"));
        // Le texte saisi disparaît, le verdict et le score restent.
        Assert.Equal(1L, await Count(cs, "daily.answers WHERE artist_answer IS NULL AND title_answer IS NULL AND artist_correct AND NOT title_correct AND score = 850"));
        foreach (var table in new[] { "players.auth_tokens", "players.device_sessions", "players.legacy_tokens", "infra.data_protection_keys" })
            Assert.Equal(0L, await Count(cs, table));
        foreach (var queue in Queues)
            Assert.Equal(0L, await Count(cs, $"messaging.{queue}"));
    }

    [Fact]
    public async Task ApiJamaisDemarree_SansTablesDeWolverine_Passe()
    {
        var cs = await database.CreateDatabaseAsync();
        await ScriptDatabase.InsertPlayerAsync(cs, "joueur@example.com", "Joueur");

        var result = await database.RunSqlFileAsync(cs, "staging-anonymize.sql", "keep=garde@example.com");

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(0L, await Count(cs, "players.accounts WHERE email::text NOT LIKE '%@example.invalid'"));
    }

    [Fact]
    public async Task CopieProdVersStaging_LanceLeScript_EnvoyeParLeWorkflow()
    {
        var ct = TestContext.Current.CancellationToken;
        var copy = await File.ReadAllTextAsync(Path.Combine(ScriptDatabase.RepositoryRoot, "deploy", "vps", "copy-prod-db-to-staging.sh"), ct);
        var workflow = await File.ReadAllTextAsync(Path.Combine(ScriptDatabase.RepositoryRoot, ".github", "workflows", "staging-db-copy.yml"), ct);

        Assert.Contains("-v keep=\"$keep_email\" < \"$ANONYMIZE_SQL\"", copy, StringComparison.Ordinal);
        // Les clés Data Protection de la prod ne sont jamais copiées.
        Assert.Contains("-T infra.data_protection_keys", copy, StringComparison.Ordinal);
        Assert.Contains("< deploy/vps/staging-anonymize.sql", workflow, StringComparison.Ordinal);
        Assert.Contains("STAGING_ANONYMIZE_SQL=$HOME/inseconds-staging-anonymize.sql bash -s", workflow, StringComparison.Ordinal);
    }

    private static Task<long> Count(string cs, string fromWhere) =>
        ScriptDatabase.ScalarAsync<long>(cs, $"SELECT count(*) FROM {fromWhere}");
}
