using InSeconds.Api.Modules.Players.Contracts;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

public sealed record AdminMeResponse(Guid PlayerId);

public static class GetAdminMeEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/me</c> : le front admin vérifie le rôle. La policy Admin, posée sur tout
    /// <c>/api/admin</c> (<c>WolverineSetup</c>), répond 401 sans joueur et 403 sans le rôle.
    /// </summary>
    [WolverineGet("/api/admin/me")]
    public static AdminMeResponse Get(ICurrentPlayer current) =>
        new(current.PlayerId ?? throw new InvalidOperationException("La policy Admin garantit un joueur identifié."));
}
