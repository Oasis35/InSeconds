using FluentAssertions;
using InSeconds.Api.Common.Auth;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Auth;

public sealed class OriginValidatorTests
{
    private static readonly string[] AllowedOrigins = ["http://localhost:5173", "https://inseconds.cc"];

    [Fact]
    public void IsTrustedOrigin_OrigineDansLaListe_True()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers.Origin = "https://inseconds.cc";

        OriginValidator.IsTrustedOrigin(ctx, AllowedOrigins).Should().BeTrue();
    }

    [Fact]
    public void IsTrustedOrigin_OrigineHorsListe_False()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers.Origin = "https://evil.example.com";

        OriginValidator.IsTrustedOrigin(ctx, AllowedOrigins).Should().BeFalse();
    }

    [Fact]
    public void IsTrustedOrigin_OrigineAbsente_RefererDansLaListe_True()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers.Referer = "http://localhost:5173/login/verify?token=abc";

        OriginValidator.IsTrustedOrigin(ctx, AllowedOrigins).Should().BeTrue();
    }

    [Fact]
    public void IsTrustedOrigin_OrigineEtRefererAbsents_False()
    {
        var ctx = new DefaultHttpContext();

        OriginValidator.IsTrustedOrigin(ctx, AllowedOrigins).Should().BeFalse();
    }

    [Fact]
    public void IsTrustedOrigin_CasseDifferente_True()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers.Origin = "HTTPS://INSECONDS.CC";

        OriginValidator.IsTrustedOrigin(ctx, AllowedOrigins).Should().BeTrue();
    }
}
