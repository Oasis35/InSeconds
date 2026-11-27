using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine.Http;

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

    /// <summary>Un nom qui prête à confusion (« Admin », « InSeconds »…).</summary>
    public const string ReservedName = "social.reserved_name";

    public const string GroupFull = "social.group_full";

    public const string TooManyGroups = "social.too_many_groups";

    /// <summary>Supprimer le groupe ou renouveler son code est réservé à son créateur.</summary>
    public const string NotOwner = "social.not_owner";

    /// <summary>Le créateur d'un groupe qui a d'autres membres ne part (ou n'est retiré) qu'après avoir désigné son successeur.</summary>
    public const string OwnerMustHandOver = "social.owner_must_hand_over";

    /// <summary>Le successeur désigné n'est pas un autre membre du groupe.</summary>
    public const string InvalidSuccessor = "social.invalid_successor";

    /// <summary>Le membre à retirer n'est pas (ou plus) dans le groupe.</summary>
    public const string MemberNotFound = "social.member_not_found";

    /// <summary>Deux tirages ont donné le même alias au même instant : le second recommence (rarissime, le tirage est sous verrou).</summary>
    public const string AliasTaken = "social.alias_taken";

    /// <summary>Le nom au classement général se choisit entre <c>pseudo</c> et <c>alias</c>.</summary>
    public const string InvalidRankingMode = "social.invalid_ranking_mode";

    /// <summary>Le jour des scores d'un groupe s'écrit <c>aaaa-mm-jj</c> et n'est pas dans le futur.</summary>
    public const string InvalidDate = "social.invalid_date";
}

/// <summary>
/// Le créateur qui part (ou que l'admin retire) désigne son successeur par son pseudo, un membre ne voyant jamais l'identifiant d'un autre : le
/// pseudo d'un compte est unique, sans tenir compte de la casse.
/// </summary>
internal static class GroupHandOver
{
    /// <summary>L'identifiant du membre de ce groupe qui porte ce pseudo ; vide si le groupe est inconnu, le pseudo vide ou personne ne le porte.</summary>
    public static async Task<Guid?> FindMemberAsync(Group? group, string? pseudo, IPlayerDirectory players, CancellationToken ct)
    {
        if (group is null || string.IsNullOrWhiteSpace(pseudo))
            return null;
        var pseudos = await players.GetPseudosAsync([.. group.Members.Select(m => m.PlayerId)], ct);
        var wanted = pseudo.Trim();
        return pseudos.Where(p => string.Equals(p.Value, wanted, StringComparison.OrdinalIgnoreCase)).Select(p => (Guid?)p.Key).FirstOrDefault();
    }

    /// <summary>Rien à vérifier si le départ ne laisse pas le groupe sans créateur ; sinon un successeur est exigé, déjà membre et autre que lui.</summary>
    public static ProblemDetails Check(Group group, Guid leaverId, string? successorPseudo, Guid? successorId)
    {
        if (!group.MustHandOverBeforeLeaving(leaverId))
            return WolverineContinue.NoProblems;
        if (string.IsNullOrWhiteSpace(successorPseudo))
            return SocialProblems.OwnerMustHandOver();
        return successorId is { } id && group.CanTransferTo(id) ? WolverineContinue.NoProblems : SocialProblems.InvalidSuccessor();
    }
}

internal static class SocialProblems
{
    public static ProblemDetails AliasTaken() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, SocialErrorCodes.AliasTaken, "Cet alias vient d'être pris : tires-en un autre.");

    public static ProblemDetails AccountRequired() =>
        ApiProblem.Of(StatusCodes.Status403Forbidden, SocialErrorCodes.AccountRequired, "Il faut un compte pour utiliser un groupe.");

    public static ProblemDetails InvalidDate() =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, SocialErrorCodes.InvalidDate, "Le jour doit être au format aaaa-mm-jj et ne pas être dans le futur.");

    public static ProblemDetails GroupNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, SocialErrorCodes.GroupNotFound, "Groupe introuvable.");

    public static ProblemDetails InvitationNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, SocialErrorCodes.InvitationNotFound, "Invitation introuvable.");

    public static ProblemDetails InvalidName(int maxLength) =>
        ApiProblem.Of(
            StatusCodes.Status400BadRequest, SocialErrorCodes.InvalidName,
            $"Le nom doit faire {GroupName.MinLength} à {maxLength} caractères (lettres, chiffres, espace, _, . ou -).");

    public static ProblemDetails ReservedName() =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, SocialErrorCodes.ReservedName, "Ce nom est réservé. Choisis-en un autre.");

    public static ProblemDetails GroupFull() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, SocialErrorCodes.GroupFull, "Ce groupe est complet.");

    public static ProblemDetails TooManyGroups() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, SocialErrorCodes.TooManyGroups, "Tu es déjà dans le nombre maximum de groupes.");

    public static ProblemDetails OwnerMustHandOver() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, SocialErrorCodes.OwnerMustHandOver, "Le créateur doit d'abord désigner un nouveau créateur.");

    public static ProblemDetails InvalidSuccessor() =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, SocialErrorCodes.InvalidSuccessor, "Le nouveau créateur doit être un autre membre du groupe.");

    public static ProblemDetails MemberNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, SocialErrorCodes.MemberNotFound, "Ce membre n'est pas dans le groupe.");

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

    [LoggerMessage(EventId = 1809, Level = LogLevel.Information, Message = "Groupe {GroupId} confié à {NewOwnerId} par {PlayerId}")]
    public static partial void OwnerTransferred(ILogger logger, int groupId, Guid newOwnerId, Guid playerId);

    [LoggerMessage(EventId = 1810, Level = LogLevel.Information, Message = "Groupe {GroupId} confié à {NewOwnerId} par l'admin {AdminId}")]
    public static partial void AdminOwnerTransferred(ILogger logger, int groupId, Guid newOwnerId, Guid adminId);

    [LoggerMessage(EventId = 1811, Level = LogLevel.Information, Message = "{PlayerId} retiré du groupe {GroupId} par l'admin {AdminId} ({Departure})")]
    public static partial void AdminMemberRemoved(ILogger logger, Guid playerId, int groupId, Guid adminId, string departure);

    [LoggerMessage(EventId = 1812, Level = LogLevel.Information, Message = "Groupe {GroupId} renommé par son créateur {PlayerId}")]
    public static partial void GroupRenamed(ILogger logger, int groupId, Guid playerId);

    /// <summary>Jamais l'alias ni le pseudo : l'identifiant et le mode seulement.</summary>
    [LoggerMessage(EventId = 1808, Level = LogLevel.Information, Message = "{PlayerId} a changé son nom au classement général ({RankingNameMode})")]
    public static partial void RankingIdentityChanged(ILogger logger, Guid playerId, string rankingNameMode);
}
