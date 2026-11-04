using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using InSeconds.Api.Infrastructure.Hosting;
using Npgsql;
using Testcontainers.PostgreSql;

namespace InSeconds.MigrationTests;

/// <summary>
/// Les scripts de sauvegarde du VPS (<c>deploy/infra/backup.sh</c> et <c>backup-verify.sh</c>), lancés pour de vrai par bash et Docker comme sur
/// le VPS : une base <c>inseconds</c> migrée (la prod), un faux R2 (<c>rclone serve s3</c>, même image que les scripts), et un faux
/// healthchecks.io et un faux Grafana (OTLP) qui notent ce qu'ils reçoivent. Vérifie aussi que les scripts écrivent bien dans
/// <c>infra.backup_runs</c> telle que la migration la crée.
/// </summary>
public sealed class BackupScriptsTests(BackupScriptsFixture env) : IClassFixture<BackupScriptsFixture>
{
    [Fact]
    public async Task SauvegardePuisControle_Reussis_NotesEnBaseEtSignales()
    {
        var bucket = await env.NewTestAsync();

        var backup = await env.RunAsync("backup.sh", bucket);
        Assert.True(backup.ExitCode == 0, backup.Output);
        var verify = await env.RunAsync("backup-verify.sh", bucket);
        Assert.True(verify.ExitCode == 0, verify.Output);

        Assert.Contains("Restauration OK : daily/inseconds-", verify.Output, StringComparison.Ordinal);
        Assert.Equal(1L, await env.CountAsync(
            "infra.backup_runs WHERE kind = 'backup' AND outcome = 'ok' AND off_site AND dump_size_bytes > 0 AND dump_taken_at IS NOT NULL AND started_at IS NOT NULL"));
        Assert.Equal(1L, await env.CountAsync("infra.backup_runs WHERE kind = 'verify' AND outcome = 'ok' AND dump_name LIKE 'daily/inseconds-%'"));
        var requests = env.RequestsOf(bucket);
        Assert.Contains(requests, r => r.Path == "/ping-key/inseconds-backup?create=1");
        Assert.Contains(requests, r => r.Path == "/ping-key/inseconds-backup-restore?create=1");
        Assert.DoesNotContain(requests, r => r.Path.Contains("/fail", StringComparison.Ordinal));
        // Une seule ligne de résumé par passage réussi vers Grafana, avec l'en-tête de l'API décodé.
        var logs = requests.Where(r => r.Path == "/otlp/v1/logs").ToList();
        Assert.Equal(2, logs.Count);
        Assert.Contains(logs, r => r.Body.Contains("\"service.name\",\"value\":{\"stringValue\":\"inseconds-backup\"}", StringComparison.Ordinal)
            && r.Body.Contains("Restauration OK", StringComparison.Ordinal) && r.Authorization == "Basic abc");
        Assert.Empty(await env.ScratchContainersAsync());
    }

    [Fact]
    public async Task Controle_SansSauvegardeSurR2_EchoueALaFraicheur_AvecLeMessageJoint()
    {
        var bucket = await env.NewTestAsync();

        var verify = await env.RunAsync("backup-verify.sh", bucket);

        Assert.Equal(1, verify.ExitCode);
        Assert.Equal(1L, await env.CountAsync(
            "infra.backup_runs WHERE kind = 'verify' AND outcome = 'failed' AND failed_step = 'freshness' AND message LIKE 'étape 1/5 fraîcheur : aucune sauvegarde%'"));
        // Le message court en tête du texte joint au signal d'échec, puis la fin du journal du passage.
        var ping = Assert.Single(env.RequestsOf(bucket), r => r.Path == "/ping-key/inseconds-backup-restore/fail?create=1");
        Assert.StartsWith("étape 1/5 fraîcheur : aucune sauvegarde dans daily/", ping.Body, StringComparison.Ordinal);
        Assert.Contains("--- étape 1/5 fraîcheur", ping.Body, StringComparison.Ordinal);
        Assert.Contains(env.RequestsOf(bucket), r => r.Path == "/otlp/v1/logs" && r.Body.Contains("\"severityText\":\"ERROR\"", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Controle_PhraseDePasseFausse_EchoueAuTelechargement()
    {
        var bucket = await env.NewTestAsync();
        Assert.Equal(0, (await env.RunAsync("backup.sh", bucket)).ExitCode);

        var verify = await env.RunAsync("backup-verify.sh", bucket, ("BACKUP_ENCRYPTION_PASSWORD", "une autre phrase"));

        Assert.Equal(1, verify.ExitCode);
        Assert.Contains("étape 2/5 téléchargement : téléchargement ou déchiffrement impossible", verify.Output, StringComparison.Ordinal);
        Assert.Empty(await env.ScratchContainersAsync());
    }

    [Fact]
    public async Task Controle_LignesManquantesDansLaSauvegarde_EchoueAuContenu()
    {
        var bucket = await env.NewTestAsync();
        Assert.Equal(0, (await env.RunAsync("backup.sh", bucket)).ExitCode);
        // La prod a grossi bien plus que ne le permet le seuil depuis la sauvegarde : elle a perdu des lignes.
        await env.ExecuteAsync("INSERT INTO players.players (id, created_at) SELECT gen_random_uuid(), now() FROM generate_series(1, 200)");
        try
        {
            var verify = await env.RunAsync("backup-verify.sh", bucket);

            Assert.Equal(1, verify.ExitCode);
            Assert.Contains("étape 4/5 contenu : players.players : ", verify.Output, StringComparison.Ordinal);
            Assert.Empty(await env.ScratchContainersAsync());
        }
        finally
        {
            await env.ExecuteAsync("DELETE FROM players.players WHERE id NOT IN (SELECT id FROM players.players ORDER BY created_at LIMIT 10)");
        }
    }

    [Fact]
    public async Task CheckoutDuStaging_RefuseAvantDeRienFaire()
    {
        var staging = Directory.CreateTempSubdirectory();
        try
        {
            var infra = Directory.CreateDirectory(Path.Combine(staging.FullName, "InSeconds-staging", "deploy", "infra"));
            foreach (var script in new[] { "backup.sh", "backup-verify.sh", "backup-common.sh" })
                File.Copy(Path.Combine(BackupScriptsFixture.ScriptDirectory, script), Path.Combine(infra.FullName, script));
            var bucket = await env.NewTestAsync();

            foreach (var script in new[] { "backup.sh", "backup-verify.sh" })
            {
                var result = await env.RunAsync(script, bucket, scriptDirectory: infra.FullName);
                Assert.Equal(1, result.ExitCode);
                Assert.Contains("est le checkout du staging", result.Output, StringComparison.Ordinal);
            }
            Assert.Empty(env.RequestsOf(bucket));
            Assert.Equal(0L, await env.CountAsync("infra.backup_runs"));
        }
        finally
        {
            staging.Delete(recursive: true);
        }
    }
}

/// <summary>Une requête reçue par le faux healthchecks.io / Grafana. <see cref="Bucket"/> : le bucket du test qui l'a envoyée (en-tête posé par l'URL).</summary>
public sealed record CapturedRequest(string Path, string Body, string? Authorization, string? Bucket);

public sealed class BackupScriptsFixture : IAsyncLifetime
{
    private const string Password = "pw-test";
    private const string S3Key = "AKIDTEST";
    private const string S3Secret = "SECRETTEST";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine")
        .WithDatabase("inseconds").WithUsername("inseconds").WithPassword(Password).Build();

    // Faux R2 : rclone sert un dossier en S3, un sous-dossier par bucket, créés avant le démarrage (rclone ne voit pas un dossier créé ensuite).
    private const int BucketCount = 20;

    private readonly IContainer _s3 = new ContainerBuilder("rclone/rclone:1.75.2")
        .WithEntrypoint("sh", "-c", $"for i in $(seq 1 {BucketCount}); do mkdir -p /data/bucket-$i; done && rclone serve s3 --auth-key {S3Key},{S3Secret} --addr :8080 /data")
        .WithWaitStrategy(Wait.ForUnixContainer().UntilMessageIsLogged("Starting s3 server"))
        .Build();

    private readonly HttpListener _listener = new();
    private readonly ConcurrentQueue<CapturedRequest> _requests = new();
    private readonly string _workDirectory = Directory.CreateTempSubdirectory("inseconds-backup-tests").FullName;
    private int _port;
    private int _buckets;

    public static string ScriptDirectory { get; } = Path.Combine(ScriptDatabase.RepositoryRoot, "deploy", "infra");

    /// <summary>Les requêtes envoyées par les scripts d'un test.</summary>
    public IReadOnlyList<CapturedRequest> RequestsOf(string bucket) => _requests.Where(r => r.Bucket == bucket).ToList();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _s3.StartAsync());
        Assert.Equal(0, await MigrateOnlyCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={ConnectionString}"]));
        await ExecuteAsync("""
            INSERT INTO daily.challenges (id, date, seed, origin) VALUES (1, (now() AT TIME ZONE 'utc')::date, 1, 0);
            INSERT INTO players.players (id, created_at) SELECT gen_random_uuid(), now() FROM generate_series(1, 10);
            """);
        _port = FreePort();
        _listener.Prefixes.Add($"http://127.0.0.1:{_port}/");
        _listener.Start();
        _ = Task.Run(ListenAsync);
    }

    public async ValueTask DisposeAsync()
    {
        _listener.Close();
        await _postgres.DisposeAsync();
        await _s3.DisposeAsync();
        Directory.Delete(_workDirectory, recursive: true);
    }

    private string ConnectionString => new NpgsqlConnectionStringBuilder(_postgres.GetConnectionString()) { Pooling = false }.ConnectionString;

    /// <summary>Un bucket neuf et vide (chaque test a ses propres sauvegardes sur le faux R2), et aucun passage noté en base.</summary>
    public async Task<string> NewTestAsync()
    {
        await ExecuteAsync("TRUNCATE infra.backup_runs");
        var index = Interlocked.Increment(ref _buckets);
        Assert.True(index <= BucketCount, "Plus de tests que de buckets prévus : augmenter BucketCount.");
        return $"bucket-{index}";
    }

    /// <summary>Lance un script comme le timer du VPS, avec un <c>.env</c> qui vise les conteneurs du test ; <paramref name="overrides"/> remplace des clés.</summary>
    public async Task<ScriptResult> RunAsync(string script, string bucket, (string Key, string Value)? overrides = null, string? scriptDirectory = null)
    {
        var values = new Dictionary<string, string>
        {
            ["INSECONDS_DB_PASSWORD"] = Password,
            ["BACKUP_DB_HOST"] = _postgres.IpAddress,
            ["BACKUP_DOCKER_NETWORK"] = "bridge",
            ["BACKUP_DIR"] = Path.Combine(_workDirectory, bucket),
            ["R2_ACCESS_KEY_ID"] = S3Key,
            ["R2_SECRET_ACCESS_KEY"] = S3Secret,
            ["R2_ENDPOINT"] = $"http://{_s3.IpAddress}:8080",
            ["R2_BUCKET"] = bucket,
            ["BACKUP_ENCRYPTION_PASSWORD"] = "phrase de passe de test",
            ["HEALTHCHECKS_PING_KEY"] = "ping-key",
            ["HEALTHCHECKS_URL"] = $"http://127.0.0.1:{_port}/{bucket}",
            ["OTEL_EXPORTER_OTLP_ENDPOINT"] = $"http://127.0.0.1:{_port}/{bucket}/otlp",
            ["OTEL_EXPORTER_OTLP_HEADERS"] = "Authorization=Basic%20abc",
        };
        if (overrides is { } o) values[o.Key] = o.Value;
        var envFile = Path.Combine(_workDirectory, $"{bucket}-{Guid.NewGuid():N}.env");
        await File.WriteAllLinesAsync(envFile, values.Select(kv => $"{kv.Key}={kv.Value}"));

        var start = new ProcessStartInfo("bash", [Path.Combine(scriptDirectory ?? ScriptDirectory, script)])
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        start.Environment["BACKUP_ENV_FILE"] = envFile;
        start.Environment["BACKUP_API_ENV_FILE"] = Path.Combine(_workDirectory, "absent.env.prod");
        using var process = Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        await process.WaitForExitAsync(timeout.Token);
        return new ScriptResult(process.ExitCode, await output + await error);
    }

    /// <summary>Les Postgres jetables restés en place (un contrôle doit toujours supprimer le sien).</summary>
    public async Task<string[]> ScratchContainersAsync()
    {
        var start = new ProcessStartInfo("docker", ["ps", "-aq", "--filter", "name=inseconds-backup-scratch-"]) { RedirectStandardOutput = true };
        using var process = Process.Start(start)!;
        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();
        return output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
    }

    public Task ExecuteAsync(string sql) => ScriptDatabase.ExecuteAsync(ConnectionString, sql);

    public async Task<long> CountAsync(string fromWhere) =>
        await ScriptDatabase.ScalarAsync<long>(ConnectionString, $"SELECT count(*) FROM {fromWhere}");

    private async Task ListenAsync()
    {
        while (_listener.IsListening)
        {
            HttpListenerContext context;
            try { context = await _listener.GetContextAsync(); }
            catch (Exception e) when (e is HttpListenerException or ObjectDisposedException) { return; }
            using (var reader = new StreamReader(context.Request.InputStream))
            {
                var url = context.Request.RawUrl ?? "";
                // /<bucket>/… : le préfixe du test, retiré pour garder le chemin que healthchecks.io ou Grafana recevrait.
                var slash = url.IndexOf('/', 1);
                var bucket = slash > 0 ? url[1..slash] : null;
                _requests.Enqueue(new CapturedRequest(slash > 0 ? url[slash..] : url, await reader.ReadToEndAsync(), context.Request.Headers["Authorization"], bucket));
            }
            context.Response.StatusCode = 200;
            context.Response.Close();
        }
    }

    private static int FreePort()
    {
        using var socket = new TcpListener(IPAddress.Loopback, 0);
        socket.Start();
        return ((IPEndPoint)socket.LocalEndpoint).Port;
    }
}
