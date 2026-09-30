namespace InSeconds.Api.Infrastructure.Settings;

public static class SettingsHostingExtensions
{
    public static IHostApplicationBuilder AddDatabaseSettings(this IHostApplicationBuilder builder, string connectionString)
    {
        var source = new DatabaseSettingsConfigurationSource(connectionString);
        builder.Configuration.Add(source);
        builder.Services.AddSingleton(source);
        builder.Services.AddSingleton<ISettingsReloader, SettingsReloader>();
        builder.Services.AddScoped<SettingsStore>();
        return builder;
    }
}
