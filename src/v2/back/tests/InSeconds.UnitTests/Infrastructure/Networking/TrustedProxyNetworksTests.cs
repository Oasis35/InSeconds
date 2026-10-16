using System.Net;
using InSeconds.Infrastructure.Networking;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace InSeconds.UnitTests.Infrastructure.Networking;

public class TrustedProxyNetworksTests
{
    [Theory]
    [InlineData("172.18.0.5")] // Caddy dans le réseau Docker
    [InlineData("10.0.0.1")]
    [InlineData("192.168.1.1")]
    [InlineData("127.0.0.1")]
    [InlineData("::1")]
    [InlineData("162.158.1.1")] // edge Cloudflare
    [InlineData("104.16.0.1")]
    [InlineData("2606:4700::1")]
    public void ProxyDeConfiance(string ip) =>
        Assert.Contains(TrustedProxyNetworks.All, n => n.Contains(IPAddress.Parse(ip)));

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("203.0.113.7")]
    [InlineData("2001:db8::1")]
    public void AdressePubliqueQuelconque_PasDeConfiance(string ip) =>
        Assert.DoesNotContain(TrustedProxyNetworks.All, n => n.Contains(IPAddress.Parse(ip)));

    [Fact]
    public void Options_DerouleTousLesSautsDansLesPlagesDeConfiance()
    {
        var options = new ServiceCollection().AddInSecondsForwardedHeaders()
            .BuildServiceProvider().GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;

        Assert.Null(options.ForwardLimit);
        Assert.Equal(ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto, options.ForwardedHeaders);
        Assert.Empty(options.KnownProxies);
        Assert.Equal(TrustedProxyNetworks.All.Count(), options.KnownIPNetworks.Count);
    }
}
