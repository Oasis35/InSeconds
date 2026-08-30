namespace InSeconds.Api.Domain;

public sealed class AllowedEmail
{
    public int Id { get; set; }
    public required string Email { get; set; }
    public DateTime CreatedAt { get; set; }
}
