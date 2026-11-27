using System.Reflection;
using System.Text.RegularExpressions;

namespace InSeconds.ArchitectureTests;

/// <summary>
/// Le rôle admin (piège 5) : posé en SQL manuel, jamais par le code. Aucune écriture de <c>is_admin</c> dans l'API, aucune méthode qui change le
/// rôle d'un compte, et le claim « admin » du cookie n'est fabriqué que par <c>PlayerClaims</c> (le cookie ne porte pas le rôle : il est relu en base).
/// </summary>
public partial class SecurityRulesTests
{
    private static readonly Assembly Api = typeof(Program).Assembly;

    [Fact]
    public void Piege5_LeCodeNEcritJamaisLeRoleAdmin()
    {
        var offenders =
            from file in ApiSources()
            from line in File.ReadLines(file).Select((text, index) => (text, number: index + 1))
            where AdminWrite().IsMatch(line.text)
            select $"{RelativePath(file)}:{line.number}";

        Assert.Empty(offenders);
    }

    [Fact]
    public void Piege5_LeRoleDuCompte_NAUnSetterPublicNiUneMethodeQuiLeChange()
    {
        var account = Api.GetType("InSeconds.Api.Modules.Players.Domain.Account", throwOnError: true)!;

        var property = account.GetProperty("IsAdmin")!;
        Assert.True(property.SetMethod is null || !property.SetMethod.IsPublic, "Account.IsAdmin ne doit pas avoir de setter public.");

        var mutators = account.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(m => m.Name.Contains("Admin", StringComparison.OrdinalIgnoreCase) && !m.IsSpecialName)
            .Select(m => m.Name);
        Assert.Empty(mutators);
    }

    [Fact]
    public void Piege5_LeClaimAdmin_NEstFabriqueQueParPlayerClaims()
    {
        var offenders =
            from file in ApiSources()
            where !file.EndsWith("PlayerClaims.cs", StringComparison.Ordinal) && !file.EndsWith("AuthSetup.cs", StringComparison.Ordinal)
            from line in File.ReadLines(file).Select((text, index) => (text, number: index + 1))
            where line.text.Contains("Roles.Admin", StringComparison.Ordinal)
            select $"{RelativePath(file)}:{line.number}";

        Assert.Empty(offenders);
    }

    // is_admin = true (SQL), IsAdmin = true / IsAdmin: true (code), « SET is_admin » : toute écriture du rôle.
    [GeneratedRegex(@"is_admin\s*=\s*(true|1)\b|\bSET\s+is_admin\b|\bIsAdmin\s*(=|:)\s*true\b", RegexOptions.IgnoreCase)]
    private static partial Regex AdminWrite();

    private static IEnumerable<string> ApiSources()
    {
        var directory = Path.Combine(SolutionDirectory(), "InSeconds.Api");
        return Directory.EnumerateFiles(directory, "*.cs", SearchOption.AllDirectories)
            .Where(file => !IsBuildOutput(file) && !file.Contains($"{Path.DirectorySeparatorChar}Generated{Path.DirectorySeparatorChar}", StringComparison.Ordinal));
    }

    private static string RelativePath(string file) => Path.GetRelativePath(SolutionDirectory(), file);

    private static bool IsBuildOutput(string file) =>
        file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
        || file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal);

    private static string SolutionDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Directory.Packages.props")))
            directory = directory.Parent;
        return directory?.FullName ?? throw new InvalidOperationException("Dossier src/back introuvable.");
    }
}
