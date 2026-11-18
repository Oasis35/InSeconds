using System.Diagnostics.Metrics;

namespace InSeconds.Api.Modules.Social.Application;

/// <summary>
/// Métriques OpenTelemetry des groupes et du classement général, pour le tableau Grafana « Activité ». Aucun identifiant de joueur ni de groupe en
/// étiquette, jamais un nom (ni pseudo ni alias) : seulement l'événement. Noms côté Prometheus : <c>inseconds_social_groups_total</c>,
/// <c>inseconds_social_ranking_identity_total</c>.
/// </summary>
public sealed class SocialMetrics
{
    public const string MeterName = "InSeconds.Social";

    public const string GroupsName = "inseconds.social.groups";
    public const string RankingIdentityName = "inseconds.social.ranking_identity";

    /// <summary>Étiquette <c>mode</c> du nom au classement général : le pseudo, un alias tiré, ou un autre alias tiré.</summary>
    public const string ModePseudo = "pseudo";
    public const string ModeAlias = "alias";
    public const string ModeOtherAlias = "other_alias";

    /// <summary>Étiquette <c>event</c> des groupes : créé, rejoint, quitté, vidé par le départ du dernier membre, supprimé par son créateur ou par l'admin.</summary>
    public const string Created = "created";
    public const string Joined = "joined";
    public const string Left = "left";
    public const string Emptied = "emptied";
    public const string Deleted = "deleted";
    public const string AdminDeleted = "admin_deleted";

    private readonly Counter<long> _groups;
    private readonly Counter<long> _identity;

    public SocialMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _groups = meter.CreateCounter<long>(GroupsName, description: "Événements des groupes entre amis, par événement (event).");
        _identity = meter.CreateCounter<long>(RankingIdentityName, description: "Nom choisi au classement général : pseudo, alias ou autre alias (mode).");
    }

    public void Group(string @event) => _groups.Add(1, new KeyValuePair<string, object?>("event", @event));

    public void RankingIdentityChanged(string mode) => _identity.Add(1, new KeyValuePair<string, object?>("mode", mode));
}
