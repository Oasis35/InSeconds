namespace InSeconds.Api.Infrastructure.Persistence;

/// <summary>
/// Schémas PostgreSQL de l'API. Aucune table ne vit dans <c>public</c>, qui reste vide.
/// </summary>
public static class DbSchemas
{
    /// <summary>Tables techniques : settings, historique des migrations EF, clés Data Protection.</summary>
    public const string Infra = "infra";

    /// <summary>
    /// Extensions PostgreSQL (<c>citext</c>). Dans un schéma à part : la copie prod → staging
    /// (<c>copy-prod-db-to-staging.sh</c>) ne copie et ne remplace que les schémas des modules, les extensions
    /// dont dépendent les colonnes du staging ne sont donc jamais touchées.
    /// </summary>
    public const string Extensions = "extensions";

    /// <summary>
    /// Messages durables de Wolverine (outbox, messages reçus, planifiés, en erreur). Le nom décrit
    /// le rôle, pas la librairie.
    /// </summary>
    public const string Messaging = "messaging";

    /// <summary>Tables de Hangfire (tâches planifiées et leur historique), créées par Hangfire.</summary>
    public const string Jobs = "jobs";

    /// <summary>Module Players : joueurs, comptes, appareils, jetons.</summary>
    public const string Players = "players";

    /// <summary>Module Catalogue : les morceaux du pool.</summary>
    public const string Catalogue = "catalogue";

    /// <summary>Module Daily : défis, parties, séries.</summary>
    public const string Daily = "daily";

    /// <summary>Module Runs : défis, parties, records et accès du second mode de jeu.</summary>
    public const string Runs = "runs";

    public const string MigrationsHistoryTable = "__ef_migrations_history";
}
