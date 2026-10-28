using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.IntegrationTests.Daily;

internal static class GameAsserts
{
    /// <summary>La réponse est une erreur de ce statut, en ProblemDetails avec ce <c>code</c> stable.</summary>
    public static async Task ProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(TestContext.Current.CancellationToken);
        Assert.Equal(code, problem!.Extensions["code"]?.ToString());
    }
}
