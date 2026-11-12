using System.Security.Cryptography;
using InSeconds.Api.Modules.Players.Contracts;

namespace InSeconds.Api.Modules.Social.Domain;

/// <summary>
/// Un groupe d'amis : un nom, un code d'invitation (le lien qui fait rejoindre), un créateur et des membres. Un groupe n'a que des comptes (pseudo
/// montré aux autres membres, jamais à un non-membre). Il disparaît avec son dernier membre ; le créateur qui s'en va (ou dont le compte est effacé)
/// passe la main au plus ancien des autres membres.
/// </summary>
public sealed class Group
{
    private readonly List<GroupMember> _members = [];

    private Group()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence HiLo).</summary>
    public int Id { get; private set; }

    public string Name { get; private set; } = "";

    /// <summary>Le code du lien d'invitation (<see cref="GroupInviteCode"/>), unique.</summary>
    public string InviteCode { get; private set; } = "";

    /// <summary>Celui qui peut supprimer le groupe et renouveler son code.</summary>
    public Guid OwnerId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public IReadOnlyCollection<GroupMember> Members => _members;

    /// <summary>Un groupe neuf, son créateur déjà membre. Le nom doit avoir été contrôlé (<see cref="GroupName"/>).</summary>
    public static Group Create(string name, string inviteCode, Guid ownerId, DateTimeOffset now)
    {
        if (GroupInviteCode.Normalize(inviteCode) != inviteCode)
            throw new ArgumentException("Code d'invitation invalide.", nameof(inviteCode));
        var group = new Group { Name = name.Trim(), InviteCode = inviteCode, OwnerId = ownerId, CreatedAt = now };
        group._members.Add(new GroupMember(ownerId, now));
        return group;
    }

    public bool IsMember(Guid playerId) => _members.Exists(m => m.PlayerId == playerId);

    public bool IsOwner(Guid playerId) => OwnerId == playerId;

    public bool IsFull(int maxMembers) => _members.Count >= maxMembers;

    /// <summary>Ajoute un membre ; refusé s'il l'est déjà (l'appelant le vérifie d'abord, et vérifie la place).</summary>
    public void Join(Guid playerId, DateTimeOffset now)
    {
        if (IsMember(playerId))
            throw new InvalidOperationException("Déjà membre de ce groupe.");
        _members.Add(new GroupMember(playerId, now));
    }

    /// <summary>
    /// Retire un membre. Le dernier membre qui part vide le groupe (<see cref="GroupDeparture.Emptied"/> : l'appelant le supprime) ; le créateur
    /// qui part passe la main au plus ancien des autres membres (<see cref="GroupDeparture.OwnerChanged"/>).
    /// </summary>
    public GroupDeparture Leave(Guid playerId)
    {
        var member = _members.Find(m => m.PlayerId == playerId) ?? throw new InvalidOperationException("Pas membre de ce groupe.");
        _members.Remove(member);
        if (_members.Count == 0)
            return GroupDeparture.Emptied;
        if (OwnerId != playerId)
            return GroupDeparture.Left;
        OwnerId = _members.OrderBy(m => m.JoinedAt).ThenBy(m => m.PlayerId).First().PlayerId;
        return GroupDeparture.OwnerChanged;
    }

    /// <summary>Un autre nom, déjà contrôlé (<see cref="GroupName"/>) : la modération de l'admin renomme un nom inapproprié.</summary>
    public void Rename(string name) => Name = name.Trim();

    /// <summary>Un nouveau code : l'ancien lien ne rejoint plus rien.</summary>
    public void RotateInviteCode(string newCode)
    {
        if (GroupInviteCode.Normalize(newCode) != newCode)
            throw new ArgumentException("Code d'invitation invalide.", nameof(newCode));
        InviteCode = newCode;
    }
}

/// <summary>Ce que le départ d'un membre a changé.</summary>
public enum GroupDeparture
{
    Left,
    OwnerChanged,
    Emptied,
}

/// <summary>Un membre d'un groupe : un joueur (compte) et la date à laquelle il l'a rejoint. Désigne le joueur par son identifiant (Players).</summary>
public sealed class GroupMember
{
    private GroupMember()
    {
    }

    internal GroupMember(Guid playerId, DateTimeOffset joinedAt)
    {
        PlayerId = playerId;
        JoinedAt = joinedAt;
    }

    public int GroupId { get; private set; }

    public Guid PlayerId { get; private set; }

    public DateTimeOffset JoinedAt { get; private set; }
}

/// <summary>
/// Le code d'invitation d'un groupe, qui est son lien : 8 caractères tirés par <see cref="RandomNumberGenerator"/> dans un alphabet sans ambiguïté
/// (ni 0/O, ni 1/I/L), en majuscules ; assez long pour ne pas se deviner (31⁸ possibles), la saisie est insensible à la casse.
/// </summary>
public static class GroupInviteCode
{
    public const int Length = 8;

    public const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    public static string Generate() => RandomNumberGenerator.GetString(Alphabet, Length);

    /// <summary>Le code tel que le stocke la base (majuscules, espaces retirés), ou <c>null</c> si ce n'est pas un code possible.</summary>
    public static string? Normalize(string? input)
    {
        var code = input?.Trim().ToUpperInvariant();
        return code is { Length: Length } && code.All(c => Alphabet.Contains(c, StringComparison.Ordinal)) ? code : null;
    }
}

/// <summary>Le nom d'un groupe : les mêmes caractères permis qu'un pseudo (<see cref="PseudoRules"/>), 3 caractères au moins.</summary>
public static class GroupName
{
    public const int MinLength = 3;

    /// <summary>La borne de la colonne : aucun réglage ne dépasse cette longueur.</summary>
    public const int ColumnLength = 40;

    public static bool IsValid(string? name, int maxLength) => PseudoRules.IsValid(name, MinLength, maxLength);

    /// <summary>
    /// Le nom de remplacement d'un nom inapproprié remis à zéro par l'admin : « Groupe » et l'identifiant du groupe (jamais son code
    /// d'invitation, qui est un secret). Toujours un nom valide, quel que soit le réglage de longueur.
    /// </summary>
    public static string Replacement(int groupId) => $"Groupe {groupId}";
}

/// <summary>Les écritures et les agrégats suivis du module : charger un groupe pour le modifier, l'ajouter, le supprimer, et les verrous.</summary>
public interface IGroupStore
{
    /// <summary>Le groupe et ses membres, suivis (pour le modifier).</summary>
    Task<Group?> FindAsync(int groupId, CancellationToken ct);

    /// <summary>L'identifiant du groupe de ce code d'invitation (déjà normalisé), sans rien suivre : on le verrouille avant de le charger.</summary>
    Task<int?> FindIdByInviteCodeAsync(string code, CancellationToken ct);

    Task<bool> InviteCodeExistsAsync(string code, CancellationToken ct);

    /// <summary>Dans combien de groupes ce joueur est-il ?</summary>
    Task<int> CountMembershipsAsync(Guid playerId, CancellationToken ct);

    void Add(Group group);

    void Remove(Group group);

    /// <summary>Verrou de transaction par joueur : deux adhésions simultanées ne dépassent pas sa limite de groupes. Exige une transaction.</summary>
    Task LockPlayerAsync(Guid playerId, CancellationToken ct);

    /// <summary>Verrou de transaction par groupe : deux adhésions simultanées ne dépassent pas sa limite de membres. Exige une transaction.</summary>
    Task LockGroupAsync(int groupId, CancellationToken ct);
}
