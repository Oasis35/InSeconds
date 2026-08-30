namespace InSeconds.Api.Domain;

public sealed class MagicLinkToken
{
    public int Id { get; set; }
    public required string Email { get; set; }
    public required string TokenHash { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? ConsumedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
