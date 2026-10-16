using InSeconds.Deezer;
using InSeconds.Infrastructure.Email;
using NetArchTest.Rules;

namespace InSeconds.ArchitectureTests;

/// <summary>Dépendances entre projets (§ 3.3 du plan v2).</summary>
public class ProjectDependencyTests
{
    [Fact]
    public void LApi_NeReferenceJamaisLHoteDeTest() =>
        // S9 : les routes /api/e2e et les faux ne doivent pas pouvoir atteindre l'image de prod.
        Assert.DoesNotContain(typeof(Program).Assembly.GetReferencedAssemblies(),
            a => a.Name!.StartsWith("InSeconds.Api.Testing", StringComparison.Ordinal));

    [Fact]
    public void Infrastructure_NeConnaitNiLApiNiLesModules() =>
        Assert.DoesNotContain(typeof(IEmailSender).Assembly.GetReferencedAssemblies(),
            a => a.Name!.StartsWith("InSeconds.Api", StringComparison.Ordinal));

    [Fact]
    public void Deezer_NeConnaitNiLApiNiLesModulesNiLInfrastructure() =>
        // § 5.1 du plan v2 : le client Deezer est un adaptateur isolé, sans dépendance entrante vers le reste.
        Assert.DoesNotContain(typeof(IPreviewProvider).Assembly.GetReferencedAssemblies(),
            a => a.Name!.StartsWith("InSeconds.", StringComparison.Ordinal));

    [Fact]
    public void LApi_UtiliseBienDeezer() =>
        Assert.Contains(typeof(Program).Assembly.GetReferencedAssemblies(), a => a.Name == "InSeconds.Deezer");

    [Fact]
    public void LeDomaineCatalogue_NeConnaitPasLeClientDeezer()
    {
        // Le domaine du morceau ne dépend que de lui-même : l'application traduit ce que Deezer répond.
        var result = Types.InAssembly(typeof(Program).Assembly)
            .That().ResideInNamespace("InSeconds.Api.Modules.Catalogue.Domain")
            .ShouldNot().HaveDependencyOn("InSeconds.Deezer")
            .GetResult();

        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }

    [Fact]
    public void LApi_UtiliseBienInfrastructure() =>
        Assert.Contains(typeof(Program).Assembly.GetReferencedAssemblies(), a => a.Name == "InSeconds.Infrastructure");
}
