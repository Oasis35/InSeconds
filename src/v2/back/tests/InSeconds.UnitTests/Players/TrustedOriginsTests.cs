using InSeconds.Api.Infrastructure.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace InSeconds.UnitTests.Players;

/// <summary>Piège 22 : origine du <c>POST</c> qui vérifie le lien magique.</summary>
public class TrustedOriginsTests
{
    private static readonly TrustedOrigins Origins = new(new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Cors:AllowedOrigins:0"] = "https://inseconds.cc",
            ["Auth:TrustedOrigins:0"] = "http://localhost:5176",
            ["Auth:TrustedOrigins:1"] = "http://localhost:5178",
        })
        .Build());

    [Theory]
    [InlineData("https://inseconds.cc", null, true)]
    [InlineData("HTTPS://INSECONDS.CC", null, true)]
    [InlineData("http://localhost:5176", null, true)]
    [InlineData("http://localhost:5178", null, true)]
    [InlineData("http://localhost:5173", null, false)]
    [InlineData("https://attaquant.example", "https://inseconds.cc/account", false)]
    [InlineData(null, "https://inseconds.cc/account/login/verify?token=x", true)]
    [InlineData(null, "https://inseconds.cc.attaquant.example/account", false)]
    [InlineData(null, "https://attaquant.example/https://inseconds.cc", false)]
    [InlineData(null, "pas une adresse", false)]
    [InlineData(null, null, false)]
    public void Origine(string? origin, string? referer, bool trusted)
    {
        var context = new DefaultHttpContext();
        if (origin is not null)
            context.Request.Headers.Origin = origin;
        if (referer is not null)
            context.Request.Headers.Referer = referer;

        Assert.Equal(trusted, Origins.IsTrusted(context.Request));
    }
}
