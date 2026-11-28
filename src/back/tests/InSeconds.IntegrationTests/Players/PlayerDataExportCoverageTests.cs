using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Le droit d'accès (RGPD) est exhaustif : toute table qui garde une colonne <c>player_id</c> est soit portée par la copie des données du joueur
/// (une section par mode, ses appareils, son compte), soit exclue ici avec sa raison. Une table ajoutée plus tard sans décision fait échouer ce
/// test, comme <see cref="PlayerDataTests"/> le fait pour l'effacement (piège 48).
/// </summary>
public class PlayerDataExportCoverageTests(PostgresFixture postgres) : IAsyncLifetime
{
    /// <summary>Les tables portées par la copie : la section (ou la partie) de l'export qui les contient.</summary>
    private static readonly Dictionary<string, string> Exported = new()
    {
        ["daily.sessions"] = "daily",              // GameExport : les parties et leurs réponses
        ["daily.streaks"] = "daily",               // StreakExport : série, gels, meilleure série
        ["players.accounts"] = "account",          // AccountExport : adresse, pseudo, date de liaison, rôle
        ["players.device_sessions"] = "devices",   // DeviceExport : les appareils connectés
        ["runs.access"] = "runs",                  // Access : quand l'accès à la Survie a été donné
        ["runs.player_levels"] = "runs",           // Level
        ["runs.received_challenges"] = "runs",     // ReceivedChallenges : les défis d'amis reçus
        ["runs.records"] = "runs",                 // Record
        ["runs.sessions"] = "runs",                // Games : les parties et leurs réponses
        ["social.group_members"] = "social",       // Groups : ses groupes, jamais les pseudos des autres membres
        ["social.ranking_identity"] = "social",    // RankingIdentity : son alias au classement général
    };

    /// <summary>Les tables que la copie ne contient pas, et pourquoi : rien de plus que ce que la personne a déjà, ou rien de personnel.</summary>
    private static readonly Dictionary<string, string> Excluded = new()
    {
        ["players.auth_tokens"] = "Jetons à usage unique du lien magique : un hash et l'adresse du lien, valables 15 minutes, supprimés à l'usage ou par la purge nocturne ; l'adresse du compte est déjà dans la copie (AccountExport).",
        ["players.legacy_tokens"] = "Hash d'un ancien cookie, gardé pour la reprise des anciens navigateurs : un secret, aucune donnée en clair ; effacé avec le compte.",
    };

    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), recordGrants: false);
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    private async Task<string[]> TablesWithPlayerIdAsync() =>
        await _app.Api.ScalarAsync<string[]>("""
            SELECT array_agg(table_schema || '.' || table_name ORDER BY table_schema, table_name) FROM information_schema.columns
            WHERE column_name = 'player_id' AND table_schema NOT IN ('pg_catalog', 'information_schema', 'messaging', 'jobs')
            """) ?? [];

    [Fact]
    public async Task Piege48_ToutesLesTablesAvecPlayerId_SontExporteesOuExcluesAvecLeurRaison()
    {
        var tables = await TablesWithPlayerIdAsync();

        var undecided = tables.Except(Exported.Keys).Except(Excluded.Keys).ToList();
        Assert.True(undecided.Count == 0,
            $"Tables avec player_id ni exportées ni exclues : {string.Join(", ", undecided)}. Les ajouter à la copie des données (IPlayerDataContributor) ou ici, avec la raison.");
    }

    [Fact]
    public async Task Piege48_LaListeNeGardePasDeTableDisparue_NiDeDoublon()
    {
        var tables = await TablesWithPlayerIdAsync();

        Assert.Empty(Exported.Keys.Concat(Excluded.Keys).Except(tables));
        Assert.Empty(Exported.Keys.Intersect(Excluded.Keys));
        Assert.All(Excluded.Values, reason => Assert.False(string.IsNullOrWhiteSpace(reason)));
    }

    [Fact]
    public async Task Piege48_ChaqueSectionCitee_EstDansLaCopieDUnJoueur()
    {
        var device = await _app.SignInDeviceAsync("couverture@example.com", "Couverture");

        var export = (await device.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        var parts = new HashSet<string>(export.Modules.Keys) { "account", "devices" };
        Assert.NotNull(export.Account);
        Assert.NotEmpty(export.Devices);
        Assert.All(Exported, entry => Assert.Contains(entry.Value, parts));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
