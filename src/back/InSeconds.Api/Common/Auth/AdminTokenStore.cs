using System.Collections.Concurrent;

namespace InSeconds.Api.Common.Auth;

public interface IAdminTokenStore
{
    string IssueToken();
    bool IsValid(string token);
    void Revoke(string token);
}

// Remplace l'ancien token statique "admin-token" partagé par tous les logins : chaque
// connexion émet désormais un jeton aléatoire propre à cette session, révocable via
// /api/admin/logout et expirant tout seul — corrige l'absence totale de révocation
// (un token qui fuyait une fois — XSS, log, poste partagé — restait valide indéfiniment
// jusqu'à changement du mot de passe admin).
// Stockage en mémoire (process API unique sur le VPS, pas de scale-out) : un redéploiement
// invalide toutes les sessions admin en cours, compromis acceptable pour cette échelle.
public sealed class AdminTokenStore(IHostEnvironment env) : IAdminTokenStore
{
    // En Testing, tous les tests d'intégration et fixtures E2E envoient directement
    // "Bearer admin-token" sans passer par un vrai login (IntegrationTestFactory,
    // e2e/fixtures/api-client.ts, e2e/pages/admin.page.ts) : on garde ce jeton fixe
    // uniquement dans cet environnement, jamais en Dev/Production.
    private const string TestingToken = "admin-token";
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(12);

    private readonly ConcurrentDictionary<string, DateTime> _validUntilByToken = new();

    public string IssueToken()
    {
        if (env.IsEnvironment("Testing"))
            return TestingToken;

        var token = MagicLinkTokenGenerator.GenerateRawToken();
        _validUntilByToken[token] = DateTime.UtcNow.Add(TokenLifetime);
        return token;
    }

    public bool IsValid(string token)
    {
        if (env.IsEnvironment("Testing"))
            return token == TestingToken;

        if (!_validUntilByToken.TryGetValue(token, out var validUntil))
            return false;

        if (validUntil > DateTime.UtcNow)
            return true;

        _validUntilByToken.TryRemove(token, out _);
        return false;
    }

    public void Revoke(string token)
    {
        if (!env.IsEnvironment("Testing"))
            _validUntilByToken.TryRemove(token, out _);
    }
}
