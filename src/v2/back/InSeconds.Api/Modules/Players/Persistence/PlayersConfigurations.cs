using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Modules.Players.Persistence;

// Tables du schéma players (§ 4.2 du plan v2). Pas de navigation EF : les relations sont déclarées
// pour la base (clés étrangères, ordre des insertions), sans propriété de navigation.

internal sealed class PlayerConfiguration : IEntityTypeConfiguration<Player>
{
    public void Configure(EntityTypeBuilder<Player> builder)
    {
        builder.ToTable("players", DbSchemas.Players);
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedNever();
    }
}

internal sealed class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    /// <summary>Index unique du pseudo, reconnu dans l'erreur d'unicité par <see cref="AccountConflictExceptionHandler"/>.</summary>
    public const string PseudoIndex = "ix_accounts_pseudo";

    /// <summary>Index unique de l'adresse, reconnu de la même façon.</summary>
    public const string EmailIndex = "ix_accounts_email";

    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("accounts", DbSchemas.Players);
        builder.HasKey(a => a.PlayerId);
        builder.HasOne<Player>().WithOne().HasForeignKey<Account>(a => a.PlayerId);
        // citext : unicité insensible à la casse garantie par la base (« Bob » et « bob » sont le même pseudo).
        builder.Property(a => a.Email).HasColumnType("citext");
        builder.Property(a => a.Pseudo).HasColumnType("citext");
        builder.HasIndex(a => a.Email).IsUnique().HasDatabaseName(EmailIndex);
        builder.HasIndex(a => a.Pseudo).IsUnique().HasDatabaseName(PseudoIndex);
        builder.Property(a => a.IsAdmin).HasDefaultValue(false);
    }
}

internal sealed class DeviceSessionConfiguration : IEntityTypeConfiguration<DeviceSession>
{
    public void Configure(EntityTypeBuilder<DeviceSession> builder)
    {
        builder.ToTable("device_sessions", DbSchemas.Players);
        builder.HasKey(s => s.Id);
        // Identifiant tiré d'une séquence dès l'ajout (et non par la base à l'insertion) : il va dans le
        // cookie, posé avant que Wolverine n'enregistre la transaction.
        builder.Property(s => s.Id).UseHiLo("device_sessions_hilo", DbSchemas.Players);
        builder.HasOne<Player>().WithMany().HasForeignKey(s => s.PlayerId);
        builder.HasIndex(s => s.PlayerId);
        builder.Property(s => s.UserAgentLabel).HasMaxLength(100);
    }
}

internal sealed class LegacyTokenConfiguration : IEntityTypeConfiguration<LegacyToken>
{
    public void Configure(EntityTypeBuilder<LegacyToken> builder)
    {
        builder.ToTable("legacy_tokens", DbSchemas.Players);
        builder.HasKey(t => t.PlayerId);
        builder.HasOne<Player>().WithOne().HasForeignKey<LegacyToken>(t => t.PlayerId);
        builder.HasIndex(t => t.TokenHash).IsUnique();
    }
}

internal sealed class AuthTokenConfiguration : IEntityTypeConfiguration<AuthToken>
{
    public void Configure(EntityTypeBuilder<AuthToken> builder)
    {
        // Un jeton de connexion porte l'adresse, un jeton de changement d'email le joueur et la
        // nouvelle adresse (S2 : un jeton ne peut pas servir à l'autre usage).
        builder.ToTable("auth_tokens", DbSchemas.Players, table => table.HasCheckConstraint(
            "ck_auth_tokens_purpose",
            "(purpose = 1 AND email IS NOT NULL AND new_email IS NULL) "
            + "OR (purpose = 2 AND player_id IS NOT NULL AND new_email IS NOT NULL)"));
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Purpose).HasConversion<short>();
        builder.Property(t => t.Email).HasColumnType("citext");
        builder.Property(t => t.NewEmail).HasColumnType("citext");
        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasOne<Player>().WithMany().HasForeignKey(t => t.PlayerId);
    }
}
