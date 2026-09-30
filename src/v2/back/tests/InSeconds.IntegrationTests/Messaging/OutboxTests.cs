using System.Collections.Concurrent;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Settings;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;
using Wolverine.Attributes;

namespace InSeconds.IntegrationTests.Messaging;

/// <summary>
/// Constat A1 du § 12 ter : la donnée et les messages qu'un handler publie partent dans la même
/// transaction. Un message n'est envoyé que si la donnée est enregistrée, et inversement.
/// </summary>
public class OutboxTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly ReceivedNotices _received = new();
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync()
    {
        _api = new ApiFactory(await postgres.CreateDatabaseAsync(), services =>
        {
            services.AddSingleton(_received);
            services.ConfigureWolverine(opts => opts.Discovery.IncludeAssembly(typeof(OutboxTests).Assembly));
        });
        _ = _api.Services; // démarre l'hôte : migrations, tables de Wolverine
    }

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task DonneeEnregistree_LeMessageEstEnvoye()
    {
        await InvokeAsync(new SaveSettingAndNotify("outbox:ok"));

        Assert.True(await _received.WaitForAsync("outbox:ok", TimeSpan.FromSeconds(15)));
        Assert.Equal(1L, await _api.ScalarAsync<long>("select count(*) from infra.settings where key = 'outbox:ok'"));
    }

    [Fact]
    public async Task EnregistrementEnEchec_AucunMessageNEstEnvoye()
    {
        // La clé existe déjà : l'insertion du handler échoue au moment de l'enregistrement,
        // après que le message a été publié.
        await _api.ScalarAsync<int>(
            "insert into infra.settings (key, value, updated_at) values ('outbox:dup', '1', now())");

        await Assert.ThrowsAnyAsync<Exception>(() => InvokeAsync(new SaveSettingAndNotify("outbox:dup")));

        Assert.False(await _received.WaitForAsync("outbox:dup", TimeSpan.FromSeconds(3)));
        Assert.Equal(0L, await _api.ScalarAsync<long>(
            "select count(*) from messaging.wolverine_incoming_envelopes where message_type like '%setting-saved%'"));
        Assert.Equal(0L, await _api.ScalarAsync<long>(
            "select count(*) from messaging.wolverine_outgoing_envelopes where message_type like '%setting-saved%'"));
    }

    private async Task InvokeAsync(object message)
    {
        await using var scope = _api.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IMessageBus>()
            .InvokeAsync(message, TestContext.Current.CancellationToken);
    }
}

public sealed record SaveSettingAndNotify(string Key);

[MessageIdentity("setting-saved")]
public sealed record SettingSaved(string Key);

public static class SaveSettingAndNotifyHandler
{
    // Pas de SaveChangesAsync : la transaction automatique enregistre le réglage et le message ensemble.
    public static SettingSaved Handle(SaveSettingAndNotify command, InSecondsDbContext db, TimeProvider time)
    {
        db.Settings.Add(new Setting(command.Key, "1", time.GetUtcNow()));
        return new SettingSaved(command.Key);
    }
}

public static class SettingSavedHandler
{
    public static void Handle(SettingSaved notice, ReceivedNotices received) => received.Add(notice.Key);
}

public sealed class ReceivedNotices
{
    private readonly ConcurrentDictionary<string, TaskCompletionSource> _keys = new();

    public void Add(string key) => Get(key).TrySetResult();

    public async Task<bool> WaitForAsync(string key, TimeSpan timeout)
    {
        try
        {
            await Get(key).Task.WaitAsync(timeout);
            return true;
        }
        catch (TimeoutException)
        {
            return false;
        }
    }

    private TaskCompletionSource Get(string key) =>
        _keys.GetOrAdd(key, _ => new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
}
