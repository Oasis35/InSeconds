using InSeconds.Api.Modules.Players.Domain;

namespace InSeconds.UnitTests.Players;

public class LegacyTokenTests
{
    [Fact]
    public void Hash_Sha256DuJetonEnMinusculesAvecTirets()
    {
        // Vecteur calculé à part : sha256 de « 0a1b2c3d-0000-4000-8000-00000000abcd » en UTF-8.
        var hash = LegacyToken.HashOf(Guid.Parse("0A1B2C3D-0000-4000-8000-00000000ABCD"));

        Assert.Equal("5565bd0bc7a04ef63358cf93b7fd5838069f6bfbf27972c8d87385f211f9555c", Convert.ToHexStringLower(hash));
    }
}
