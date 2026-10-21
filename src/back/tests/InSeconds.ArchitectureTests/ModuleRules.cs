using System.Reflection;

namespace InSeconds.ArchitectureTests;

/// <summary>
/// Le vocabulaire des règles de dépendance : quels modules sont des **noyaux** (Players, Catalogue : partagés, ils ne connaissent aucun mode)
/// et lesquels sont des **modes** de jeu (Daily et Runs : chacun s'appuie sur les noyaux et sur Gameplay, aucun ne voit un autre mode).
/// Un nouveau mode s'ajoute à <see cref="Modes"/> : toutes les règles le couvrent aussitôt.
/// </summary>
internal static class ModuleRules
{
    public const string ModulesNamespace = "InSeconds.Api.Modules";

    /// <summary>Les modes de jeu ; un nouveau mode s'ajoute ici.</summary>
    public static readonly string[] Modes = ["Daily", "Runs"];

    /// <summary>Les noyaux : ils ne voient d'un mode que ce que <see cref="NamedExceptions"/> autorise.</summary>
    public static readonly string[] Cores = ["Players", "Catalogue"];

    /// <summary>
    /// Les seules choses d'un mode qu'un noyau a le droit de voir, nommées une à une : le gel offert à la création d'un compte (Daily seul a des
    /// gels, la création d'un compte est de Players). Tout le reste passe dans l'autre sens : le mode implémente un contrat du noyau
    /// (<c>IPlayerDataContributor</c>, <c>ITrackUsage</c>).
    /// </summary>
    public static readonly string[] NamedExceptions = ["InSeconds.Api.Modules.Daily.Contracts.IStreakGrants"];

    public static string Namespace(string module) => $"{ModulesNamespace}.{module}";

    /// <summary>
    /// Tout ce que contient un mode (domaine, application, persistance, contrats, sa classe de module), un type après l'autre, sauf les exceptions
    /// nommées. NetArchTest compare par préfixe : la racine d'un mode couvrirait aussi son dossier <c>Contracts</c>, d'où les types nommés.
    /// </summary>
    public static string[] TypesOf(Assembly api, string mode)
    {
        var root = Namespace(mode);
        return api.GetTypes()
            .Where(t => t.Namespace is not null && (t.Namespace == root || t.Namespace.StartsWith(root + ".", StringComparison.Ordinal)))
            .Select(t => t.FullName!)
            .Where(name => !NamedExceptions.Contains(name))
            .Distinct()
            .ToArray();
    }
}
