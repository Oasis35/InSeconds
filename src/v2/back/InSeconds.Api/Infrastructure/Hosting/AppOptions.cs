namespace InSeconds.Api.Infrastructure.Hosting;

/// <summary>
/// Adresse publique du front (<c>App:PublicUrl</c>, même clé qu'en v1), pour les liens envoyés par
/// email : <c>https://inseconds.cc</c> en prod, <c>https://dev.inseconds.cc</c> en staging, le front
/// local ailleurs.
/// </summary>
public sealed class AppOptions
{
    public const string Section = "App";

    public string PublicUrl { get; set; } = "";

    /// <summary>Une page du front, sans double barre oblique.</summary>
    public string Link(string pathAndQuery) => PublicUrl.TrimEnd('/') + pathAndQuery;

    public static IServiceCollection AddAppOptions(IServiceCollection services)
    {
        services.AddOptions<AppOptions>()
            .BindConfiguration(Section)
            .Validate(o => Uri.TryCreate(o.PublicUrl, UriKind.Absolute, out _), "App:PublicUrl doit être une adresse absolue.")
            .ValidateOnStart();
        return services;
    }
}
