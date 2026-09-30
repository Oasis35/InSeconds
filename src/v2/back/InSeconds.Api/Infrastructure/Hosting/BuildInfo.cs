using System.Reflection;

namespace InSeconds.Api.Infrastructure.Hosting;

public static class BuildInfo
{
    /// <summary>Date UTC de compilation (métadonnée <c>BuildUtc</c> du csproj), comme en v1.</summary>
    public static string? BuildUtc { get; } = typeof(BuildInfo).Assembly
        .GetCustomAttributes<AssemblyMetadataAttribute>()
        .FirstOrDefault(a => a.Key == "BuildUtc")?.Value;
}
