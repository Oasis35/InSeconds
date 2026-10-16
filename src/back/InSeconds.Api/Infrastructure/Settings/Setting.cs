namespace InSeconds.Api.Infrastructure.Settings;

/// <summary>
/// Un réglage modifiable sans redéploiement (table <c>infra.settings</c>). La clé est le chemin de
/// configuration complet (<c>Daily:GuessTimerSeconds</c>) et la valeur un document JSON.
/// </summary>
public sealed class Setting
{
    private Setting()
    {
    }

    public Setting(string key, string valueJson, DateTimeOffset updatedAt, string? description = null)
    {
        Key = key;
        ValueJson = valueJson;
        UpdatedAt = updatedAt;
        Description = description;
    }

    public string Key { get; private set; } = null!;

    public string ValueJson { get; private set; } = null!;

    public string? Description { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public void Update(string valueJson, DateTimeOffset updatedAt)
    {
        ValueJson = valueJson;
        UpdatedAt = updatedAt;
    }
}
