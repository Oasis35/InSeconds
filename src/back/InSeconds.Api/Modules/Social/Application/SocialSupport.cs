using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Social.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Social.Application;

/// <summary>
/// Réglages des groupes, relus à chaud depuis <c>infra.settings</c> (<c>Social:…</c>), sans ligne nécessaire en base. Une limite abaissée ne chasse
/// personne : elle ne joue que sur les prochaines adhésions et créations.
/// </summary>
public sealed class SocialOptions
{
    public const string Section = "Social";

    public const int DefaultMaxMembersPerGroup = 15;
    public const int DefaultMaxGroupsPerPlayer = 5;
    public const int DefaultMaxNameLength = 24;

    /// <summary>Nombre de membres d'un groupe, créateur compris (de 2 à 100).</summary>
    public int MaxMembersPerGroup { get; set; } = DefaultMaxMembersPerGroup;

    /// <summary>Nombre de groupes où un joueur peut être (de 1 à 50).</summary>
    public int MaxGroupsPerPlayer { get; set; } = DefaultMaxGroupsPerPlayer;

    /// <summary>Longueur du nom d'un groupe (de 3 à 40, la colonne).</summary>
    public int MaxNameLength { get; set; } = DefaultMaxNameLength;
}

/// <summary>
/// Les limites en vigueur, lues à chaque appel. Une valeur hors bornes (écrite à la main en base) retombe sur le défaut, sans empêcher le jeu.
/// </summary>
public sealed class SocialRules(IOptionsMonitor<SocialOptions> options)
{
    public int MaxMembers => InRange(options.CurrentValue.MaxMembersPerGroup, 2, 100, SocialOptions.DefaultMaxMembersPerGroup);

    public int MaxGroups => InRange(options.CurrentValue.MaxGroupsPerPlayer, 1, 50, SocialOptions.DefaultMaxGroupsPerPlayer);

    public int MaxNameLength => InRange(options.CurrentValue.MaxNameLength, GroupName.MinLength, GroupName.ColumnLength, SocialOptions.DefaultMaxNameLength);

    private static int InRange(int value, int min, int max, int fallback) => value >= min && value <= max ? value : fallback;
}

/// <summary>Codes d'erreur du module Social (préfixe <c>social.</c>). **Ne jamais renommer un code publié** (le front les traduit).</summary>
public static class SocialErrorCodes
{
    /// <summary>Un groupe se crée et se rejoint avec un compte : un invité est invité à en créer un.</summary>
    public const string AccountRequired = "social.account_required";

    /// <summary>Groupe inconnu, ou dont on n'est pas membre : rien n'en est révélé.</summary>
    public const string GroupNotFound = "social.group_not_found";

    public const string InvitationNotFound = "social.invitation_not_found";

    public const string InvalidName = "social.invalid_name";

    public const string GroupFull = "social.group_full";

    public const string TooManyGroups = "social.too_many_groups";

    /// <summary>Supprimer le groupe ou renouveler son code est réservé à son créateur.</summary>
    public const string NotOwner = "social.not_owner";
}

internal static class SocialProblems
{
    public static ProblemDetails AccountRequired() =>
        ApiProblem.Of(StatusCodes.Status403Forbidden, SocialErrorCodes.AccountRequired, "Il faut un compte pour utiliser un groupe.");

    public static ProblemDetails GroupNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, SocialErrorCodes.GroupNotFound, "Groupe introuvable.");

    public static ProblemDetails InvitationNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, SocialErrorCodes.InvitationNotFound, "Invitation introuvable.");

    public static ProblemDetails InvalidName(int maxLength) =>
        ApiProblem.Of(
            StatusCodes.Status400BadRequest, SocialErrorCodes.InvalidName,
            $"Le nom doit faire {GroupName.MinLength} à {maxLength} caractères (lettres, chiffres, espace, _, . ou -).");

    public static ProblemDetails GroupFull() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, SocialErrorCodes.GroupFull, "Ce groupe est complet.");

    public static ProblemDetails TooManyGroups() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, SocialErrorCodes.TooManyGroups, "Tu es déjà dans le nombre maximum de groupes.");

    public static ProblemDetails NotOwner() =>
        ApiProblem.Of(StatusCodes.Status403Forbidden, SocialErrorCodes.NotOwner, "Seul le créateur du groupe peut le faire.");
}

/// <summary>
/// Journaux du module : jamais le nom d'un groupe, ni un pseudo, ni un code d'invitation (le code est un secret qui donne l'accès) ; des identifiants
/// seulement.
/// </summary>
internal static partial class SocialLog
{
    [LoggerMessage(EventId = 1800, Level = LogLevel.Information, Message = "Groupe {GroupId} créé par {PlayerId}")]
    public static partial void GroupCreated(ILogger logger, int groupId, Guid playerId);

    [LoggerMessage(EventId = 1801, Level = LogLevel.Information, Message = "{PlayerId} a rejoint le groupe {GroupId}")]
    public static partial void GroupJoined(ILogger logger, int groupId, Guid playerId);

    [LoggerMessage(EventId = 1802, Level = LogLevel.Information, Message = "{PlayerId} a quitté le groupe {GroupId} ({Departure})")]
    public static partial void GroupLeft(ILogger logger, int groupId, Guid playerId, string departure);

    [LoggerMessage(EventId = 1803, Level = LogLevel.Information, Message = "Groupe {GroupId} supprimé par {PlayerId}")]
    public static partial void GroupDeleted(ILogger logger, int groupId, Guid playerId);

    [LoggerMessage(EventId = 1804, Level = LogLevel.Information, Message = "Code d'invitation du groupe {GroupId} renouvelé par {PlayerId}")]
    public static partial void InviteCodeRotated(ILogger logger, int groupId, Guid playerId);

    [LoggerMessage(EventId = 1805, Level = LogLevel.Information, Message = "Groupe {GroupId} renommé par l'admin {AdminId}")]
    public static partial void AdminRenamed(ILogger logger, int groupId, Guid adminId);

    [LoggerMessage(EventId = 1806, Level = LogLevel.Information, Message = "Nom du groupe {GroupId} remis à zéro par l'admin {AdminId}")]
    public static partial void AdminNameReset(ILogger logger, int groupId, Guid adminId);

    [LoggerMessage(EventId = 1807, Level = LogLevel.Information, Message = "Groupe {GroupId} supprimé par l'admin {AdminId}")]
    public static partial void AdminDeleted(ILogger logger, int groupId, Guid adminId);
}
