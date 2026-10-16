using System.Reflection;
using Mono.Cecil;
using Mono.Cecil.Cil;
using NetArchTest.Rules;
using Wolverine.Http;

namespace InSeconds.ArchitectureTests;

/// <summary>
/// Règles des handlers annoncées par le CLAUDE.md racine (« Règles dures ») et le § 5.3 du plan v2 : Wolverine
/// enregistre la transaction (jamais de <c>SaveChangesAsync</c> dans un handler), et une route renvoie un
/// résultat métier ou un <c>ProblemDetails</c> de ses étapes, jamais un <c>IResult</c>.
/// </summary>
public class HandlerRulesTests
{
    private const string ModulesNamespace = "InSeconds.Api.Modules";
    private static readonly Assembly Api = typeof(Program).Assembly;

    /// <summary>
    /// Les seuls appels à <c>SaveChanges</c> de l'API, chacun hors d'une transaction de Wolverine. Une entrée de plus
    /// se justifie ici et dans le CLAUDE.md du back.
    /// </summary>
    private static readonly string[] AllowedSaveChangesCallers =
    [
        // Écrit puis recharge la configuration : le rechargement doit lire la ligne enregistrée. Appelé par la route
        // du cooldown (Daily, AdminSettings), qui est [NonTransactional] pour cette raison.
        "InSeconds.Api.Infrastructure.Settings.SettingsStore.SetAsync",
        // Reprise d'un cookie v1 par le middleware de transition, hors handler : l'appareil ouvert va dans le cookie.
        "InSeconds.Api.Modules.Players.Persistence.EfPlayerSessions.OpenFromLegacyTokenAsync",
        // Commande en ligne --freeze-day-stats : ni serveur ni Wolverine, une transaction par jour.
        "InSeconds.Api.Infrastructure.Hosting.FreezeDayStatsCommand.CloseOneAsync",
    ];

    [Fact]
    public void SaveChanges_SeulementDansLesExceptionsEcrites()
    {
        using var module = ModuleDefinition.ReadModule(Api.Location);

        var callers = module.GetTypes()
            // Le code généré par Wolverine (Internal.Generated) enregistre la transaction : c'est lui, et lui seul, qui doit le faire.
            .Where(t => !IsGenerated(t))
            .SelectMany(t => t.Methods)
            .Where(m => m.HasBody && m.Body.Instructions.Any(IsSaveChangesCall))
            .Select(SourceMethodName)
            .Distinct()
            .Order()
            .ToArray();

        Assert.Equal(AllowedSaveChangesCallers.Order(), callers);
    }

    [Fact]
    public void LesRoutesWolverine_NeRenvoientJamaisDIResult()
    {
        var routes = Api.GetTypes()
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            .Where(m => m.GetCustomAttributes<WolverineHttpMethodAttribute>().Any())
            .ToArray();
        // Un changement de l'attribut de Wolverine ne doit pas faire passer la règle à vide.
        Assert.True(routes.Length > 30, $"{routes.Length} routes Wolverine trouvées");

        var offenders = routes
            .Where(m => ReturnsIResult(m.ReturnType))
            .Select(m => $"{m.DeclaringType!.FullName}.{m.Name}")
            .ToArray();

        Assert.Empty(offenders);
    }

    [Fact]
    public void LaCoucheApplicationDesModules_NUtiliseNiIResultNiResults()
    {
        var result = Types.InAssembly(Api)
            .That().ResideInNamespaceMatching(@"^InSeconds\.Api\.Modules\.\w+\.Application(\.|$)")
            .ShouldNot().HaveDependencyOnAny(
                "Microsoft.AspNetCore.Http.IResult", "Microsoft.AspNetCore.Http.Results", "Microsoft.AspNetCore.Http.TypedResults",
                "Microsoft.AspNetCore.Http.HttpResults")
            .GetResult();

        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }

    /// <summary>
    /// Un noyau (Players, Catalogue) ne voit d'un mode que ses <c>Contracts</c> : Players appelle Daily par
    /// <c>Daily.Contracts.IStreakGrants</c> (le gel offert à la création d'un compte), jamais par son domaine ou ses handlers.
    /// </summary>
    [Fact]
    public void UnNoyau_NeVoitDUnModeQueSesContracts()
    {
        // NetArchTest compare par préfixe : la racine Daily couvrirait Daily.Contracts, ses types sont donc nommés un à un.
        var root = $"{ModulesNamespace}.Daily";
        var daily = Api.GetTypes()
            .Where(t => t.Namespace is not null
                && (t.Namespace == root || t.Namespace.StartsWith(root + ".", StringComparison.Ordinal))
                && !t.Namespace.StartsWith($"{root}.Contracts", StringComparison.Ordinal))
            .Select(t => t.Namespace == root ? t.FullName! : t.Namespace!)
            .Distinct()
            .ToArray();
        Assert.Contains($"{root}.Domain", daily);

        foreach (var core in new[] { "Players", "Catalogue" })
        {
            var result = Types.InAssembly(Api)
                .That().ResideInNamespace($"{ModulesNamespace}.{core}")
                .ShouldNot().HaveDependencyOnAny(daily)
                .GetResult();

            Assert.True(result.IsSuccessful, $"{core} : {string.Join(", ", result.FailingTypeNames ?? [])}");
        }
    }

    private static bool IsGenerated(TypeDefinition type)
    {
        while (type.DeclaringType is { } outer)
            type = outer;
        return type.Namespace.StartsWith("Internal.Generated", StringComparison.Ordinal);
    }

    private static bool IsSaveChangesCall(Instruction instruction) =>
        instruction.OpCode.Code is Code.Call or Code.Callvirt
        && instruction.Operand is MethodReference { Name: "SaveChanges" or "SaveChangesAsync" } method
        && InheritsDbContext(method.DeclaringType);

    private static bool InheritsDbContext(TypeReference? type)
    {
        for (var current = type; current is not null;)
        {
            if (current.FullName == "Microsoft.EntityFrameworkCore.DbContext")
                return true;
            try
            {
                current = current.Resolve()?.BaseType;
            }
            catch (AssemblyResolutionException)
            {
                return false;
            }
        }

        return false;
    }

    /// <summary>La méthode écrite dans le code : celle d'un <c>async</c> est dans une machine à états (<c>&lt;SetAsync&gt;d__3.MoveNext</c>).</summary>
    private static string SourceMethodName(MethodDefinition method)
    {
        var type = method.DeclaringType;
        if (type.DeclaringType is { } outer && type.Name.StartsWith('<'))
            return $"{outer.FullName}.{type.Name[1..type.Name.IndexOf('>', StringComparison.Ordinal)]}";
        return $"{type.FullName}.{method.Name}";
    }

    private static bool ReturnsIResult(Type returnType)
    {
        var type = returnType.IsGenericType && (returnType.GetGenericTypeDefinition() == typeof(Task<>) || returnType.GetGenericTypeDefinition() == typeof(ValueTask<>))
            ? returnType.GetGenericArguments()[0]
            : returnType;
        return typeof(Microsoft.AspNetCore.Http.IResult).IsAssignableFrom(type);
    }
}
