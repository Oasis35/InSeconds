using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Infrastructure.Persistence;

public sealed class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options)
{
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
