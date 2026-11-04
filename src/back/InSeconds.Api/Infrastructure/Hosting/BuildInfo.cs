using System.Reflection;

namespace InSeconds.Api.Infrastructure.Hosting;

public static class BuildInfo
{
    /// <summary>Date UTC de compilation (métadonnée <c>BuildUtc</c> du csproj).</summary>
    public static string? BuildUtc { get; } = typeof(BuildInfo).Assembly
        .GetCustomAttributes<AssemblyMetadataAttribute>()
        .FirstOrDefault(a => a.Key == "BuildUtc")?.Value;

    /// <summary>Commit déployé : variable <c>BUILD_COMMIT</c> de l'image (argument <c>GIT_COMMIT</c> posé par <c>deploy.sh</c>), vide sinon.</summary>
    public static string? Commit { get; } = Environment.GetEnvironmentVariable("BUILD_COMMIT") is { Length: > 0 } commit ? commit : null;
}
