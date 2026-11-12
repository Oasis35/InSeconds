using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Application;
using InSeconds.Api.Modules.Social.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Modules.Social.Persistence;

// Tables du schéma social. Les clés étrangères vers players.players sont déclarées **par le nom du type** : Social n'utilise des autres modules que
// leur dossier Contracts.

internal sealed class GroupConfiguration : IEntityTypeConfiguration<Group>
{
    /// <summary>Index unique du code d'invitation : le lien d'un groupe.</summary>
    public const string InviteCodeIndex = "ix_groups_invite_code";

    public void Configure(EntityTypeBuilder<Group> builder)
    {
        builder.ToTable("groups", DbSchemas.Social);
        builder.HasKey(g => g.Id);
        // Identifiant tiré d'une séquence dès l'ajout : la création le rend dans sa réponse avant l'enregistrement par Wolverine.
        builder.Property(g => g.Id).UseHiLo("groups_hilo", DbSchemas.Social);
        builder.Property(g => g.Name).HasMaxLength(GroupName.ColumnLength).IsRequired();
        builder.Property(g => g.InviteCode).HasColumnType("char(8)").IsRequired();
        builder.HasIndex(g => g.InviteCode).IsUnique().HasDatabaseName(InviteCodeIndex);
        // Le créateur est toujours membre : l'effacement de son compte passe la main avant de le supprimer (SocialPlayerData).
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(Group.OwnerId)).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(g => g.Members).WithOne().HasForeignKey(m => m.GroupId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(g => g.Members).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class GroupMemberConfiguration : IEntityTypeConfiguration<GroupMember>
{
    public void Configure(EntityTypeBuilder<GroupMember> builder)
    {
        builder.ToTable("group_members", DbSchemas.Social);
        builder.HasKey(m => new { m.GroupId, m.PlayerId });
        // Pour compter les groupes d'un joueur et retrouver ses adhésions.
        builder.HasIndex(m => m.PlayerId);
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(GroupMember.PlayerId)).OnDelete(DeleteBehavior.Restrict);
    }
}

// Implémentations publiques : Wolverine construit lui-même les dépendances des endpoints (code généré), et refuse une implémentation interne.

public sealed class EfGroupStore(InSecondsDbContext db) : IGroupStore
{
    /// <summary>Premier entier du verrou d'un joueur (le second est dérivé de son identifiant) : ne croise aucun autre verrou de l'API.</summary>
    private const int PlayerLockNamespace = 0x53_4F_50_4C; // « SOPL »

    /// <summary>Premier entier du verrou d'un groupe (le second est son identifiant).</summary>
    private const int GroupLockNamespace = 0x53_4F_47_52; // « SOGR »

    public Task<Group?> FindAsync(int groupId, CancellationToken ct) =>
        db.Set<Group>().Include(g => g.Members).FirstOrDefaultAsync(g => g.Id == groupId, ct);

    public async Task<int?> FindIdByInviteCodeAsync(string code, CancellationToken ct) =>
        await db.Set<Group>().AsNoTracking().Where(g => g.InviteCode == code).Select(g => (int?)g.Id).FirstOrDefaultAsync(ct);

    public Task<bool> InviteCodeExistsAsync(string code, CancellationToken ct) => db.Set<Group>().AnyAsync(g => g.InviteCode == code, ct);

    public Task<int> CountMembershipsAsync(Guid playerId, CancellationToken ct) => db.Set<GroupMember>().CountAsync(m => m.PlayerId == playerId, ct);

    public void Add(Group group) => db.Set<Group>().Add(group);

    public void Remove(Group group) => db.Set<Group>().Remove(group);

    // hashtext donne un entier de 32 bits à partir de l'identifiant : deux joueurs peuvent partager un verrou (collision rarissime), ils s'attendent
    // alors un instant, sans autre conséquence. Comme EfRunsStore.
    public async Task LockPlayerAsync(Guid playerId, CancellationToken ct)
    {
        RequireTransaction("Le compte des groupes d'un joueur");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({PlayerLockNamespace}, hashtext({playerId.ToString()}))", ct);
    }

    public async Task LockGroupAsync(int groupId, CancellationToken ct)
    {
        RequireTransaction("La modification d'un groupe");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({GroupLockNamespace}, {groupId})", ct);
    }

    // Un verrou « de transaction » est relâché dès la fin d'une requête hors transaction : il ne protégerait rien.
    private void RequireTransaction(string what)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException($"{what} doit tourner dans une transaction.");
    }
}

public sealed class EfSocialQueries(InSecondsDbContext db) : ISocialQueries
{
    public async Task<IReadOnlyList<GroupView>> ListGroupsOfAsync(Guid playerId, CancellationToken ct)
    {
        var groups = await db.Set<Group>().AsNoTracking()
            .Where(g => g.Members.Any(m => m.PlayerId == playerId))
            .Include(g => g.Members)
            .OrderBy(g => g.Members.Where(m => m.PlayerId == playerId).Select(m => m.JoinedAt).FirstOrDefault()).ThenBy(g => g.Id)
            .AsSplitQuery()
            .ToListAsync(ct);
        return [.. groups.Select(ViewOf)];
    }

    public async Task<GroupView?> FindGroupForMemberAsync(int groupId, Guid playerId, CancellationToken ct)
    {
        var group = await db.Set<Group>().AsNoTracking().Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId && g.Members.Any(m => m.PlayerId == playerId), ct);
        return group is null ? null : ViewOf(group);
    }

    public async Task<InvitationView?> FindInvitationAsync(string code, Guid? playerId, CancellationToken ct) =>
        await db.Set<Group>().AsNoTracking()
            .Where(g => g.InviteCode == code)
            .Select(g => new InvitationView(g.Name, g.Members.Count, playerId != null && g.Members.Any(m => m.PlayerId == playerId)))
            .FirstOrDefaultAsync(ct);

    private static GroupView ViewOf(Group group) =>
        new(group.Id, group.Name, group.InviteCode, group.OwnerId, group.CreatedAt, [.. group.Members.Select(m => new GroupMemberEntry(m.PlayerId, m.JoinedAt))]);
}

/// <summary>
/// La copie et l'effacement des données de groupe d'un joueur (ses droits RGPD) : Social est un contributeur de Players, comme les modes de jeu.
/// Enregistré par <c>ApiComposition.AddPlayerDataContributors</c>. La copie ne contient que ce qui le concerne : ses groupes (nom, date, son rôle), jamais
/// les pseudos des autres membres.
/// </summary>
public sealed class SocialPlayerData(InSecondsDbContext db) : IPlayerDataContributor
{
    public string Module => "social";

    public async Task<object> ExportAsync(Guid playerId, CancellationToken ct)
    {
        var groups = await (from m in db.Set<GroupMember>().AsNoTracking()
                            join g in db.Set<Group>().AsNoTracking() on m.GroupId equals g.Id
                            where m.PlayerId == playerId
                            orderby m.JoinedAt, g.Id
                            select new SocialGroupExport(g.Name, g.OwnerId == playerId, m.JoinedAt, g.CreatedAt, g.Members.Count))
            .ToListAsync(ct);
        return new SocialDataExport(groups);
    }

    // Exécuté tout de suite, dans la transaction de l'appelant (pas de SaveChanges : la ligne du joueur part juste après). Un groupe qu'il a créé passe
    // au plus ancien des autres membres, ou disparaît s'il n'en a pas ; puis ses adhésions partent.
    public async Task<int> DeleteAsync(Guid playerId, CancellationToken ct)
    {
        var owned = await db.Set<Group>().AsNoTracking()
            .Where(g => g.OwnerId == playerId)
            .Select(g => new
            {
                g.Id,
                Next = g.Members.Where(m => m.PlayerId != playerId).OrderBy(m => m.JoinedAt).ThenBy(m => m.PlayerId).Select(m => (Guid?)m.PlayerId).FirstOrDefault(),
            })
            .ToListAsync(ct);
        foreach (var group in owned)
        {
            if (group.Next is { } next)
                await db.Set<Group>().Where(g => g.Id == group.Id).ExecuteUpdateAsync(s => s.SetProperty(g => g.OwnerId, next), ct);
            else
                await db.Set<Group>().Where(g => g.Id == group.Id).ExecuteDeleteAsync(ct);
        }

        await db.Set<GroupMember>().Where(m => m.PlayerId == playerId).ExecuteDeleteAsync(ct);
        // Aucune « partie » ici : le compte rendu de l'effacement ne compte que les parties de jeu.
        return 0;
    }
}
