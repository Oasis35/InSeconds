namespace InSeconds.Api.Infrastructure.Persistence;

/// <summary>
/// Schémas PostgreSQL de la v2. Aucune table v2 ne vit dans <c>public</c> : ce schéma garde
/// les tables v1 jusqu'à leur suppression après la bascule.
/// </summary>
public static class DbSchemas
{
    /// <summary>Tables techniques : settings, historique des migrations EF, clés Data Protection.</summary>
    public const string Infra = "infra";

    /// <summary>
    /// Extensions PostgreSQL (<c>citext</c>). Hors de <c>public</c> pour que la copie prod → staging,
    /// limitée à <c>public</c>, ne les touche pas.
    /// </summary>
    public const string Extensions = "extensions";

    /// <summary>
    /// Messages durables de Wolverine (outbox, messages reçus, planifiés, en erreur). Le nom décrit
    /// le rôle, pas la librairie (§ 4.6 du plan v2).
    /// </summary>
    public const string Messaging = "messaging";

    /// <summary>Tables de Hangfire (tâches planifiées et leur historique), créées par Hangfire.</summary>
    public const string Jobs = "jobs";

    /// <summary>Module Players : joueurs, comptes, appareils, jetons (§ 4.2 du plan v2).</summary>
    public const string Players = "players";

    public const string MigrationsHistoryTable = "__ef_migrations_history";
}
