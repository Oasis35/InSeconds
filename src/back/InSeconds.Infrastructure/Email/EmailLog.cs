using Microsoft.Extensions.Logging;

namespace InSeconds.Infrastructure.Email;

/// <summary>
/// Événements d'envoi d'email, avec les mêmes identifiants et les mêmes champs qu'en v1
/// (<c>PlayerActionLog</c>) : les tableaux de bord existants continuent de fonctionner. Jamais
/// l'adresse du destinataire : le sujet et l'identifiant Brevo suffisent.
/// </summary>
internal static partial class EmailLog
{
    [LoggerMessage(EventId = 1007, Level = LogLevel.Information,
        Message = "Email « {EmailSubject} » envoyé (Brevo {EmailMessageId})")]
    public static partial void EmailSent(ILogger logger, string emailSubject, string? emailMessageId);

    [LoggerMessage(EventId = 1101, Level = LogLevel.Warning,
        Message = "Échec de l'envoi de l'email « {EmailSubject} » (HTTP {HttpStatus})")]
    public static partial void EmailFailed(ILogger logger, Exception? exception, string emailSubject, int? httpStatus);
}
