namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>
/// Un genre musical, tel que Deezer le nomme. L'identifiant est celui de Deezer (jamais généré ici) : deux albums du même genre
/// partagent la même ligne. Un morceau n'a pas de genre propre chez Deezer, c'est son album qui en porte (un album peut en avoir
/// plusieurs, ou aucun).
/// </summary>
public sealed class Genre
{
    private Genre()
    {
    }

    public Genre(long id, string name)
    {
        Id = id;
        Name = name;
    }

    /// <summary>L'identifiant du genre chez Deezer.</summary>
    public long Id { get; private set; }

    public string Name { get; private set; } = null!;

    /// <summary>Le nom que Deezer donne aujourd'hui à ce genre (il peut être corrigé ou traduit).</summary>
    public void Rename(string name) => Name = name;
}
