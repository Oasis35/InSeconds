using InSeconds.Api.Modules.Players.Domain;

namespace InSeconds.UnitTests.Players;

public class DeviceLabelTests
{
    [Theory]
    [InlineData("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36", "Chrome · Android")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari · iPhone")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1", "Chrome · iPhone")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0", "Edge · Windows")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox · macOS")]
    [InlineData("Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", "Samsung Internet · Android")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0", "Opera · Linux")]
    [InlineData("curl/8.9.1", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Libelle(string? userAgent, string? expected) => Assert.Equal(expected, DeviceLabel.From(userAgent));

    [Fact]
    public void Libelle_TientDansLaColonne() =>
        Assert.True(DeviceLabel.From("Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0")!.Length <= 100);
}
