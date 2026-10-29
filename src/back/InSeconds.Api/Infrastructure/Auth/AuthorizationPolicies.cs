namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>
/// Noms des policies d'autorisation, transverses : la composition les applique aux routes (tout <c>/api/admin</c>,
/// tableau de bord <c>/jobs</c>) sans connaître le module qui authentifie le joueur (<c>Modules/Players/Auth</c>).
/// </summary>
public static class AuthorizationPolicies
{
    /// <summary>Réservé aux comptes admin : tout <c>/api/admin</c> et le tableau de bord <c>/jobs</c>.</summary>
    public const string Admin = "Admin";
}

/// <summary>Rôles portés par le joueur de la requête, posés par la validation du cookie (<c>Modules/Players/Auth</c>).</summary>
public static class Roles
{
    public const string Admin = "admin";
}
