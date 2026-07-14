using InSeconds.Api.Domain;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Infrastructure.Persistence;

// IDataProtectionKeyContext : les clés Data Protection sont persistées en base
// (table DataProtectionKeys) pour survivre aux redémarrages/redéploiements —
// sinon les cookies joueurs (chiffrés avec ces clés) sont invalidés à chaque fois.
public sealed class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    public DbSet<Player> Players => Set<Player>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<Track> Tracks => Set<Track>();
    public DbSet<DailyChallenge> DailyChallenges => Set<DailyChallenge>();
    public DbSet<DailyChallengeTrack> DailyChallengeTracks => Set<DailyChallengeTrack>();
    public DbSet<GameSession> GameSessions => Set<GameSession>();
    public DbSet<GameSessionAnswer> GameSessionAnswers => Set<GameSessionAnswer>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
