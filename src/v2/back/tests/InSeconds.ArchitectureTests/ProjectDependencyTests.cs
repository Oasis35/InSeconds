using InSeconds.Infrastructure.Email;

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
    public void LApi_UtiliseBienInfrastructure() =>
        Assert.Contains(typeof(Program).Assembly.GetReferencedAssemblies(), a => a.Name == "InSeconds.Infrastructure");
}
