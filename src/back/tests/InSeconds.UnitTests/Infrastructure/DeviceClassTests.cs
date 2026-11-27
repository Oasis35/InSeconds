using InSeconds.Infrastructure.Http;

namespace InSeconds.UnitTests.Infrastructure;

public class DeviceClassTests
{
    [Theory]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "phone")]
    [InlineData("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36", "phone")]
    [InlineData("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "tablet")]
    [InlineData("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "tablet")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "desktop")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0", "desktop")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "desktop")]
    [InlineData("curl/8.9.1", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Classe(string? userAgent, string? expected) => Assert.Equal(expected, DeviceClass.From(userAgent));

    [Fact]
    public void Classes_TiennentDansLaColonne() =>
        Assert.All(DeviceClass.All, c => Assert.True(c.Length <= DeviceClass.MaxLength));
}
