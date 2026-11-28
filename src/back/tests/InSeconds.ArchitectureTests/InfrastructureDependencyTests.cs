using System.Reflection;
using NetArchTest.Rules;

namespace InSeconds.ArchitectureTests;

/// <summary>
/// Le dossier <c>InSeconds.Api/Infrastructure</c> (erreurs, réglages, tâches, persistance, temps, hébergement) est transverse :
/// il ne connaît aucun module. Ce qui est propre à un module vit dans le module (l'authentification du joueur dans
/// <c>Modules/Players/Auth</c>). Seuls les types qui assemblent l'API ou en sont des points d'entrée voient les modules, nommés un à un
/// ci-dessous : une nouvelle dépendance doit y être ajoutée, avec sa raison, ou rangée dans son module.
/// </summary>
public class InfrastructureDependencyTests
{
    private const string InfrastructureNamespace = "InSeconds.Api.Infrastructure";
    private static readonly Assembly Api = typeof(Program).Assembly;

    /// <summary>Les types de composition et les points d'entrée, seuls autorisés à voir les modules.</summary>
    private static readonly string[] Composition =
    [
        // Assemble l'API : enregistre chaque module, l'authentification du joueur et le pipeline HTTP.
        "InSeconds.Api.Infrastructure.Hosting.ApiComposition",
        // Configure Wolverine pour toute l'API : les services des modules que le code généré doit demander au conteneur.
        // (InSecondsDbContext n'a pas besoin d'y être : il lit les configurations des modules par réflexion sur l'assembly.)
        "InSeconds.Api.Infrastructure.Messaging.WolverineSetup",
        // Points d'entrée en ligne de commande : --export-player / --delete-player (Players) et --freeze-day-stats (Daily).
        "InSeconds.Api.Infrastructure.Hosting.PlayerDataCommand",
        "InSeconds.Api.Infrastructure.Hosting.FreezeDayStatsCommand",
    ];

    [Fact]
    public void LInfrastructureDeLApi_NeDependDAucunModule_SaufLaComposition()
    {
        var infrastructure = Types.InAssembly(Api).That().ResideInNamespace(InfrastructureNamespace);
        // Un renommage du dossier ne doit pas faire passer la règle à vide.
        Assert.NotEmpty(infrastructure.GetTypes());

        var result = infrastructure
            .ShouldNot().HaveDependencyOn(ModuleRules.ModulesNamespace)
            .GetResult();

        var unexpected = (result.FailingTypeNames ?? []).Where(name => !IsComposition(name)).ToArray();
        Assert.True(unexpected.Length == 0, $"Dépendances vers un module hors composition : {string.Join(", ", unexpected)}");
    }

    /// <summary>Chaque exception désigne un type qui existe encore : une liste périmée n'autorise rien en silence.</summary>
    [Fact]
    public void LesExceptionsNommees_DesignentDesTypesExistants() =>
        Assert.All(Composition, name => Assert.NotNull(Api.GetType(name)));

    // Un type autorisé couvre ses types imbriqués (classes privées, lambdas, machines à états async).
    private static bool IsComposition(string name) =>
        Composition.Any(allowed => name == allowed
            || name.StartsWith(allowed + "+", StringComparison.Ordinal)
            || name.StartsWith(allowed + "/", StringComparison.Ordinal));
}
