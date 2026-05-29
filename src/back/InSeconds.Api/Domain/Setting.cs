namespace InSeconds.Api.Domain;

public sealed class Setting
{
    public int Id { get; set; }
    public required string Key { get; set; }
    public required string Value { get; set; }
    public string? Description { get; set; }
    public DateTime UpdatedAt { get; set; }
}
