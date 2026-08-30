namespace InSeconds.Api.Features.Admin.AllowedEmails.GetAllowedEmails;

public sealed record GetAllowedEmailsResponse(IReadOnlyList<AllowedEmailDto> Emails);

public sealed record AllowedEmailDto(int Id, string Email, DateTime CreatedAt, bool IsActivated);
