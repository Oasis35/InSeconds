namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Le format du texte partagé par « Partager mon score ».</summary>
public enum ShareFormat : short
{
    /// <summary>Le format court : une ligne d'un emoji par morceau (✅ / 🔶 / 🅾️).</summary>
    Short = 1,

    /// <summary>Le format détaillé : une ligne par morceau, l'artiste, le titre et le temps d'écoute.</summary>
    Long = 2,
}

/// <summary>
/// Le nombre de partages d'un format un jour de jeu. Un simple compteur : **rien n'est gardé en base du joueur** qui a partagé (rien à exporter ni à
/// effacer pour lui), incrémenté en une requête par <see cref="IDailyStore.RecordShareAsync"/>.
/// </summary>
public sealed class DailyShareCount
{
    private DailyShareCount() { }

    public DateOnly Date { get; private set; }
    public ShareFormat Format { get; private set; }
    public int Count { get; private set; }
}
