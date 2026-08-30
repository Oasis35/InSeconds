using System.Net.Http.Json;

namespace InSeconds.Api.IntegrationTests.Auth;

[Collection("Integration")]
public class LogoutTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Logout_ViderLeCookie_ProchaineRequeteCreeUnNouveauGuest()
    {
        var client = factory.CreateClient();

        var meBefore = await client.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        var logoutResp = await client.PostAsync("/api/auth/logout", content: null);
        Assert.True(logoutResp.IsSuccessStatusCode);

        var meAfter = await client.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        Assert.NotEqual(meBefore!.PlayerId, meAfter!.PlayerId);
        Assert.True(meAfter.IsGuest);
    }

    private sealed record PlayerMeDto(Guid PlayerId, bool IsGuest, string? Email, string? Pseudo);
}
