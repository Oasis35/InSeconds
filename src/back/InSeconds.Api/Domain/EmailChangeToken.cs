namespace InSeconds.Api.Domain;

public sealed class EmailChangeToken
{
    public int Id { get; set; }
    public required Guid PlayerId { get; set; }
    public required string NewEmail { get; set; }
    public required string TokenHash { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? ConsumedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
