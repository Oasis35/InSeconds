using System.Diagnostics.Metrics;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>
/// Métriques OpenTelemetry des joueurs, lues par le tableau Grafana « Activité » (<c>deploy/grafana/</c>). Aucun identifiant de joueur en
/// étiquette. Noms côté Prometheus : <c>inseconds_players_guests_created_total</c>, <c>inseconds_players_sign_ins_total</c>,
/// <c>inseconds_players_accounts_erased_total</c>.
/// </summary>
public sealed class PlayersMetrics
{
    public const string MeterName = "InSeconds.Players";

    public const string GuestsCreatedName = "inseconds.players.guests_created";
    public const string SignInsName = "inseconds.players.sign_ins";
    public const string AccountsErasedName = "inseconds.players.accounts_erased";

    private readonly Counter<long> _guestsCreated;
    private readonly Counter<long> _signIns;
    private readonly Counter<long> _accountsErased;

    public PlayersMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _guestsCreated = meter.CreateCounter<long>(GuestsCreatedName, description: "Invités créés, par source d'arrivée (nettoyée : utm_source ou domaine du référent, direct, other).");
        _signIns = meter.CreateCounter<long>(SignInsName, description: "Connexions par lien magique : Found (compte existant) ou Linked (compte créé).");
        _accountsErased = meter.CreateCounter<long>(AccountsErasedName, description: "Comptes effacés : request (demande du joueur) ou inactive (purge).");

        // Un compteur n'a de série qu'après son premier ajout, et Prometheus ne compte pas le premier échantillon d'une série neuve :
        // sans ces zéros, le premier invité ou la première connexion de chaque démarrage disparaissait de increase() (3 invités
        // affichés sur 13 jours pour une trentaine). Les sources courantes, les deux issues de connexion et les deux causes d'effacement.
        foreach (var source in SeededSources)
            _guestsCreated.Add(0, new KeyValuePair<string, object?>("source", source));
        foreach (var outcome in new[] { "Found", "Linked" })
            _signIns.Add(0, new KeyValuePair<string, object?>("outcome", outcome));
        foreach (var reason in new[] { "request", "inactive" })
            _accountsErased.Add(0, new KeyValuePair<string, object?>("reason", reason));
    }

    private static readonly string[] SeededSources = [Domain.AcquisitionSource.Direct, Domain.AcquisitionSource.Other, "instagram", "share", "google.com"];

    /// <param name="source">Déjà nettoyée par <see cref="Domain.AcquisitionSource"/> : un nombre limité de valeurs.</param>
    public void GuestCreated(string source) => _guestsCreated.Add(1, new KeyValuePair<string, object?>("source", source));

    public void SignedIn(string outcome) => _signIns.Add(1, new KeyValuePair<string, object?>("outcome", outcome));

    public void AccountErased(string reason) => _accountsErased.Add(1, new KeyValuePair<string, object?>("reason", reason));
}
