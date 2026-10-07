using System.Reflection;
using NetArchTest.Rules;

namespace InSeconds.ArchitectureTests;

/// <summary>
/// Règles de dépendance du back (§ 3.3 du plan v2). Elles s'appliquent à chaque module dès qu'il
/// existe dans <c>InSeconds.Api.Modules</c>.
/// </summary>
public class ModuleDependencyTests
{
    private const string ModulesNamespace = "InSeconds.Api.Modules";
    private static readonly Assembly Api = typeof(Program).Assembly;

    [Fact]
    public void UnModule_NUtiliseDesAutresModulesQueLeurDossierContracts()
    {
        var modules = Modules();
        var failures = new List<string>();

        foreach (var module in modules)
        {
            var forbidden = modules
                .Where(other => other != module)
                .SelectMany(ForbiddenDependenciesOf)
                .ToArray();
            if (forbidden.Length == 0)
                continue;

            var result = Types.InAssembly(Api)
                .That().ResideInNamespace($"{ModulesNamespace}.{module}")
                .ShouldNot().HaveDependencyOnAny(forbidden)
                .GetResult();
            if (!result.IsSuccessful)
                failures.AddRange(result.FailingTypeNames.Select(t => $"{t} (module {module})"));
        }

        Assert.Empty(failures);
    }

    [Fact]
    public void LeDomaine_NeDependNiDEfCoreNiDAspNetCoreNiDeNpgsql()
    {
        var result = Types.InAssembly(Api)
            .That().ResideInNamespaceMatching(@"^InSeconds\.Api\.Modules\.\w+\.Domain(\.|$)")
            .ShouldNot().HaveDependencyOnAny("Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore", "Npgsql")
            .GetResult();

        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }

    /// <summary>
    /// Gameplay est de la logique pure (§ 3.3 du plan v2) : il ne dépend que de <c>Catalogue/Contracts</c> et n'a
    /// besoin ni de l'accès aux données, ni du web, ni de l'infrastructure de l'API. Daily s'appuiera dessus.
    /// </summary>
    [Fact]
    public void Gameplay_NeDependQueDeCatalogueContracts_EtResteSansAccesAuxDonneesNiAuWeb()
    {
        var gameplay = Types.InAssembly(Api).That().ResideInNamespace($"{ModulesNamespace}.Gameplay");
        // Un renommage du dossier ne doit pas faire passer la règle à vide.
        Assert.NotEmpty(gameplay.GetTypes());

        var result = gameplay
            .ShouldNot().HaveDependencyOnAny(
                "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore", "Npgsql", "Wolverine", "Hangfire",
                "InSeconds.Api.Infrastructure", "InSeconds.Infrastructure", "InSeconds.Deezer",
                $"{ModulesNamespace}.Players", $"{ModulesNamespace}.Daily",
                $"{ModulesNamespace}.Catalogue.Domain", $"{ModulesNamespace}.Catalogue.Application", $"{ModulesNamespace}.Catalogue.Persistence")
            .GetResult();

        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }

    /// <summary>Les règles d'un mode se construisent sur la manche : Gameplay ne connaît aucun mode, jamais l'inverse.</summary>
    [Fact]
    public void LesModulesDesNoyaux_NeDependentPasDeGameplay()
    {
        foreach (var core in new[] { "Players", "Catalogue" })
        {
            var result = Types.InAssembly(Api)
                .That().ResideInNamespace($"{ModulesNamespace}.{core}")
                .ShouldNot().HaveDependencyOnAny($"{ModulesNamespace}.Gameplay")
                .GetResult();

            Assert.True(result.IsSuccessful, $"{core} : {string.Join(", ", result.FailingTypeNames ?? [])}");
        }
    }

    private static string[] Modules() =>
        Api.GetTypes()
            .Select(t => t.Namespace)
            .Where(ns => ns is not null && ns.StartsWith(ModulesNamespace + ".", StringComparison.Ordinal))
            .Select(ns => ns![(ModulesNamespace.Length + 1)..].Split('.')[0])
            .Distinct()
            .ToArray();

    /// <summary>
    /// Tout ce qu'un autre module n'a pas le droit d'utiliser : ses sous-espaces de noms hors
    /// <c>Contracts</c>, et les types posés à sa racine (<c>DailyModule</c>…).
    /// </summary>
    private static IEnumerable<string> ForbiddenDependenciesOf(string module)
    {
        var root = $"{ModulesNamespace}.{module}";
        var contracts = $"{root}.Contracts";
        return Api.GetTypes()
            .Where(t => t.Namespace is not null
                && (t.Namespace == root || t.Namespace.StartsWith(root + ".", StringComparison.Ordinal))
                && t.Namespace != contracts
                && !t.Namespace.StartsWith(contracts + ".", StringComparison.Ordinal))
            .Select(t => t.Namespace == root ? t.FullName! : t.Namespace!)
            .Distinct();
    }
}
