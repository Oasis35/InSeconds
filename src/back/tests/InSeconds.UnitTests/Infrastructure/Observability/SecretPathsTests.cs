using InSeconds.Api.Infrastructure.Hosting;

namespace InSeconds.UnitTests.Infrastructure.Observability;

/// <summary>Un code de lien (invitation d'un groupe, playlist d'un ami) n'entre ni dans une trace ni dans un journal.</summary>
public class SecretPathsTests
{
    [Theory]
    [InlineData("/api/social/invitations/ABCD2345", "/api/social/invitations/{code}")]
    [InlineData("/api/social/invitations/ABCD2345/join", "/api/social/invitations/{code}/join")]
    [InlineData("/api/runs/challenges/K7P2QX/comparison", "/api/runs/challenges/{code}/comparison")]
    [InlineData("/ranking/join/ABCD2345", "/ranking/join/{code}")]
    [InlineData("/setlist/K7P2QX", "/setlist/{code}")]
    [InlineData("/runs/K7P2QX", "/runs/{code}")]
    public void Mask_RemplaceLeCode(string path, string expected) => Assert.Equal(expected, LinkSecrets.Paths.Mask(path));

    [Theory]
    [InlineData("/setlist")]
    [InlineData("/setlist/")]
    [InlineData("/setlist/history")]
    [InlineData("/setlist/history/42")]
    [InlineData("/setlist/hits")]
    [InlineData("/setlistx/K7P2QX")]
    [InlineData("/daily")]
    [InlineData("/api/social/groups/3")]
    [InlineData(null)]
    public void Mask_LaisseLesAutresChemins(string? path) => Assert.Equal(path, LinkSecrets.Paths.Mask(path));
}
