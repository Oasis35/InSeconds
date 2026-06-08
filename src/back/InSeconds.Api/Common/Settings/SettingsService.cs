using Microsoft.Extensions.Options;

namespace InSeconds.Api.Common.Settings;

public sealed class SettingsService(IOptions<AppSettings> options)
{
    public Task<AppSettings> GetAsync(CancellationToken ct = default)
        => Task.FromResult(options.Value);
}
