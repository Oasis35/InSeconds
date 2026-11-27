using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>
/// Réglages des noms réservés (section <c>Players</c>). Une liste vide prend la liste de départ (<see cref="ReservedNameDefaults"/>) ; une liste
/// renseignée la remplace en entier. Listes sans valeur initiale : le binder ajouterait les éléments lus à ceux de départ.
/// </summary>
public sealed class PlayersOptions
{
    public const string Section = "Players";

    /// <summary>Termes refusés dès qu'ils sont dans le nom (« TeamInSeconds »).</summary>
    public List<string>? ReservedContains { get; set; }

    /// <summary>Termes refusés comme mot du nom (« Admin Club »), pas dans un mot plus long.</summary>
    public List<string>? ReservedWords { get; set; }

    /// <summary>Termes refusés quand ils sont tout le nom, chiffres de fin compris (« Team2 »).</summary>
    public List<string>? ReservedExact { get; set; }

    public IReadOnlyList<string> EffectiveReservedContains => ReservedContains is { Count: > 0 } ? ReservedContains : ReservedNameDefaults.Contains;

    public IReadOnlyList<string> EffectiveReservedWords => ReservedWords is { Count: > 0 } ? ReservedWords : ReservedNameDefaults.Words;

    public IReadOnlyList<string> EffectiveReservedExact => ReservedExact is { Count: > 0 } ? ReservedExact : ReservedNameDefaults.Exact;
}

/// <summary>
/// Les noms réservés en vigueur, relus à chaud : la règle (<see cref="ReservedNamePolicy"/>) est reconstruite quand les réglages changent, pas à
/// chaque appel.
/// </summary>
public sealed class ReservedNames(IOptionsMonitor<PlayersOptions> options) : IReservedNames
{
    private (PlayersOptions Options, ReservedNamePolicy Policy)? _cache;

    public bool IsReserved(string? name) => Current().IsReserved(name);

    private ReservedNamePolicy Current()
    {
        var value = options.CurrentValue;
        if (_cache is { } cached && ReferenceEquals(cached.Options, value))
            return cached.Policy;
        var policy = new ReservedNamePolicy(value.EffectiveReservedContains, value.EffectiveReservedWords, value.EffectiveReservedExact);
        _cache = (value, policy);
        return policy;
    }
}
