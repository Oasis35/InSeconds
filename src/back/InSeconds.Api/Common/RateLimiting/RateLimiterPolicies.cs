namespace InSeconds.Api.Common.RateLimiting;

// Regroupe les noms de policies de rate limiting partagées entre plusieurs features. Les
// policies propres à un seul endpoint restent définies dessus (cf. LoginEndpoint.LoginRateLimiterPolicy,
// RequestMagicLinkEndpoint.RateLimiterPolicy, SearchEndpoint.RateLimiterPolicy).
public static class RateLimiterPolicies
{
    // GetCurrentPlayer (peek=false) et StartSession créent tous deux un Player à la demande sans
    // authentification préalable — même ressource protégée (grossissement non borné de la table
    // Players par un visiteur qui boucle sur l'un ou l'autre endpoint), donc un compteur par IP
    // partagé entre les deux plutôt que deux limites indépendantes.
    public const string PlayerCreation = "player-creation";
}
