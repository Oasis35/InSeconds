using System.Text.RegularExpressions;

namespace InSeconds.ArchitectureTests;

/// <summary>
/// L'heure passe toujours par <c>TimeProvider</c> ou <c>IGameCalendar</c>, pour que les tests
/// puissent la fixer (la v1 avait 58 <c>DateTime.UtcNow</c>, dont le bug du piège 18).
/// </summary>
public partial class ClockUsageTests
{
    [Theory]
    [InlineData("InSeconds.Api")]
    [InlineData("InSeconds.Deezer")]
    public void LeCodeDe_NeLitJamaisLHorlogeSysteme(string project)
    {
        var apiDirectory = Path.Combine(SolutionDirectory(), project);
        var offenders =
            from file in Directory.EnumerateFiles(apiDirectory, "*.cs", SearchOption.AllDirectories)
            where !IsBuildOutput(file)
            from line in File.ReadLines(file).Select((text, index) => (text, number: index + 1))
            where !IsComment(line.text) && SystemClock().IsMatch(line.text)
            select $"{Path.GetRelativePath(apiDirectory, file)}:{line.number}";

        Assert.Empty(offenders);
    }

    [GeneratedRegex(@"\bDateTime(Offset)?\.(UtcNow|Now|Today)\b")]
    private static partial Regex SystemClock();

    private static bool IsComment(string line)
    {
        var trimmed = line.TrimStart();
        return trimmed.StartsWith("//", StringComparison.Ordinal) || trimmed.StartsWith('*');
    }

    private static bool IsBuildOutput(string file) =>
        file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
        || file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal);

    private static string SolutionDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Directory.Packages.props")))
            directory = directory.Parent;
        return directory?.FullName ?? throw new InvalidOperationException("Dossier src/v2/back introuvable.");
    }
}
