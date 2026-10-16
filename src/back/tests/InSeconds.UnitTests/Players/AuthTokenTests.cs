using InSeconds.Api.Modules.Players.Domain;

namespace InSeconds.UnitTests.Players;

public class AuthTokenTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 3, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Secret_43CaracteresBase64Url_JamaisDeuxFoisLeMeme()
    {
        var first = AuthTokenSecret.Generate();

        Assert.Matches("^[A-Za-z0-9_-]{43}$", first);
        Assert.NotEqual(first, AuthTokenSecret.Generate());
    }

    [Fact]
    public void Hash_Sha256DuTexteEnUtf8_CommeLaV1()
    {
        // Vecteur de référence de SHA-256 ; la v1 stockait ces mêmes octets en hexadécimal (R14).
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            Convert.ToHexStringLower(AuthTokenSecret.Hash("abc")));
    }

    [Fact]
    public void JetonDeConnexion_Valable15Minutes()
    {
        var token = AuthToken.IssueLogin("joueuse@example.com", [1, 2, 3], Now);

        Assert.Equal((AuthTokenPurpose.Login, "joueuse@example.com"), (token.Purpose, token.Email));
        Assert.True(token.IsUsableAt(Now.AddMinutes(15).AddTicks(-1)));
        Assert.False(token.IsUsableAt(Now.AddMinutes(15)));
    }

    [Fact]
    public void Consomme_UneSeuleFois()
    {
        var token = AuthToken.IssueLogin("joueuse@example.com", [1, 2, 3], Now);

        token.Consume(Now.AddMinutes(1));

        Assert.Equal(Now.AddMinutes(1), token.ConsumedAt);
        Assert.False(token.IsUsableAt(Now.AddMinutes(2)));
        Assert.Throws<InvalidOperationException>(() => token.Consume(Now.AddMinutes(2)));
    }

    [Fact]
    public void Expire_NeSeConsommePlus()
    {
        var token = AuthToken.IssueLogin("joueuse@example.com", [1, 2, 3], Now);

        Assert.Throws<InvalidOperationException>(() => token.Consume(Now.AddMinutes(16)));
    }

    [Fact]
    public void SessionRevoquee_GardeSaPremiereDate()
    {
        var session = DeviceSession.Open(Guid.NewGuid(), Now);

        session.Revoke(Now.AddMinutes(1));
        session.Revoke(Now.AddMinutes(2));

        Assert.Equal(Now.AddMinutes(1), session.RevokedAt);
    }
}
