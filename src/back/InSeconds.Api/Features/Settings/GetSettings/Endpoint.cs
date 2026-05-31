using InSeconds.Api.Common.Settings;

namespace InSeconds.Api.Features.Settings.GetSettings;

public static class GetSettingsEndpoint
{
    public static IEndpointRouteBuilder MapGetSettings(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/settings", async (SettingsService settings, CancellationToken ct) =>
            Results.Ok(await settings.GetAsync(ct)));

        return app;
    }
}
