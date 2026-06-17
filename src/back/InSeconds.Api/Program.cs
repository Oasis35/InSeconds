using FluentValidation;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Scoring;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Challenges.CreateChallenge;
using InSeconds.Api.Features.Admin.GenerateToday;
using InSeconds.Api.Features.Admin.Challenges.DeezerSearch;
using InSeconds.Api.Features.Deezer;
using InSeconds.Api.Features.Admin.Challenges.GetChallenges;
using InSeconds.Api.Features.Admin.Stats.GetAdminStats;
using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Features.Admin.ResetToday;
using InSeconds.Api.Features.Admin.Tracks.AddTrack;
using InSeconds.Api.Features.Admin.Tracks.GetTracks;
using InSeconds.Api.Features.Auth.Me;
using InSeconds.Api.Features.Stats.Today;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Features.Settings.GetSettings;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wolverine;
using Wolverine.FluentValidation;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicyName = "AllowAngular";

var pgUri = Environment.GetEnvironmentVariable("NF_INSECONDS_DB_POSTGRES_URI");
var connectionString = pgUri is not null
    ? BuildNpgsqlConnectionString(pgUri)
    : builder.Configuration.GetConnectionString("DefaultConnection")!;

builder.Configuration.Sources.Add(new AppDbConfigurationSource(connectionString));

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Host.UseWolverine(opts =>
{
    opts.ServiceLocationPolicy = JasperFx.CodeGeneration.Model.ServiceLocationPolicy.AllowedButWarn;
    opts.UseRuntimeCompilation();
    opts.UseFluentValidation();
});

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
        policy.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

builder.Services.AddOptions<AppSettings>()
    .BindConfiguration(AppDbConfigurationProvider.SectionPrefix);
builder.Services.AddSingleton<IPostConfigureOptions<AppSettings>, AppSettingsPostConfigure>();
builder.Services.AddScoped<SettingsService>();
builder.Services.AddScoped<GetTracksHandler>();
builder.Services.AddScoped<TodayStatsHandler>();
builder.Services.AddScoped<DailyChallengeGenerator>();
builder.Services.AddHostedService<GenerateDailyChallengeService>();

builder.Services.AddSingleton<ScoreCalculator>();
builder.Services.AddSingleton<TextNormalizer>();

builder.Services.AddHttpClient<DeezerClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Deezer:BaseUrl"] ?? "https://api.deezer.com");
});

builder.Services.AddDataProtection().SetApplicationName("InSeconds");
builder.Services.AddScoped<ICookieAuthService>(sp => new CookieAuthService(
    sp.GetRequiredService<ApplicationDbContext>(),
    sp.GetRequiredService<IDataProtectionProvider>().CreateProtector("InSeconds.Auth.Cookie"),
    sp.GetRequiredService<IHostEnvironment>()));

builder.Services.AddOpenApi();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.Migrate();

    if (app.Environment.IsDevelopment())
    {
        var seeded = SeedDevelopmentData(db);
        if (seeded)
        {
            app.Logger.LogWarning("===================================================");
            app.Logger.LogWarning("---------- SEED OK ----------");
            app.Logger.LogWarning("===================================================");
        }
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(CorsPolicyName);
app.UseMiddleware<PlayerAuthMiddleware>();

app.MapGet("/health", () => Results.Ok(new { status = "ok", utc = DateTime.UtcNow }));

app.MapGetSettings();
app.MapMe();
app.MapTodayStats();
app.MapAddTrack();
app.MapGetTracks();
app.MapStartSession();
app.MapSubmitAnswer();
app.MapAdminLogin();
app.MapResetToday();
app.MapGenerateToday();
app.MapGetChallenges();
app.MapGetAdminStats();
app.MapDeezerSearch();
app.MapDeezerSearchPublic();
app.MapCreateChallenge();

app.Run();

static bool SeedDevelopmentData(ApplicationDbContext db)
{
    // Ne seed que sur une base vide (pas de tracks du tout)
    if (db.Tracks.Any())
        return false;

    var today = DateOnly.FromDateTime(DateTime.UtcNow);

    // 9 morceaux : 3 par défi × 3 jours (J-2, J-1, aujourd'hui)
    var allTracks = new (long DeezerTrackId, string Artist, string Title, string? CoverHash)[]
    {
        // J-2
        (67238735,  "Daft Punk",        "Get Lucky",              "b63b04be8ef880c3c65f0e7d13b2e4da"),
        (6337356,   "Stromae",          "Alors on danse",         "6de41a2ce00c20680b5bcd8e21e748e2"),
        (879930,    "Coldplay",         "Yellow",                 "9d8b1b0f5aec0e5cf15efbecc48a8c20"),
        // J-1
        (76580611,  "Pharrell Williams","Happy",                  "6bbb2ea1e2b72e4267ec89e1a4a2e6c3"),
        (1109731,   "Amy Winehouse",    "Rehab",                  "4a0db9e4bb66b285e836c8b2a7a5e5e6"),
        (921709,    "Gorillaz",         "Feel Good Inc.",         "2a3d1e2ce90c20680b5bcd8e21e748e2"),
        // Aujourd'hui
        (912486,    "Eminem",           "Lose Yourself",          "7de41a2ce00c20680b5bcd8e21e748e2"),
        (618340,    "Radiohead",        "Creep",                  "1bb2ea1e2b72e4267ec89e1a4a2e6a44"),
        (624174012, "Billie Eilish",    "Bad Guy",                "5ab2ea1e2b72e4267ec89e1a4a2e6c55"),
    };

    var tracks = allTracks.Select(t => new Track
    {
        DeezerTrackId = t.DeezerTrackId,
        Artist        = t.Artist,
        Title         = t.Title,
        CoverHash     = t.CoverHash,
        CreatedAt     = DateTime.UtcNow,
    }).ToList();

    db.Tracks.AddRange(tracks);
    db.SaveChanges();

    // 3 défis : J-2, J-1, aujourd'hui
    var days = new[] { today.AddDays(-2), today.AddDays(-1), today };
    var challenges = days.Select(d => new DailyChallenge { Date = d, Seed = d.DayNumber }).ToList();
    db.DailyChallenges.AddRange(challenges);
    db.SaveChanges();

    // Associer les morceaux aux défis (3 par défi, dans l'ordre)
    var tracksByDay = new[] { tracks[..3], tracks[3..6], tracks[6..9] };
    for (var i = 0; i < challenges.Count; i++)
    {
        db.DailyChallengeTracks.AddRange(tracksByDay[i].Select((t, pos) => new DailyChallengeTrack
        {
            DailyChallengeId   = challenges[i].Id,
            TrackId            = t.Id,
            Position           = pos + 1,
            DeezerRankSnapshot = 0,
        }));
    }
    db.SaveChanges();

    // Player dev avec streak = 2 (a joué J-2 et J-1, pas encore aujourd'hui)
    var devPlayer = new Player
    {
        Id             = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001"),
        IsGuest        = true,
        AuthToken      = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001"),
        CreatedAt      = DateTime.UtcNow,
        CurrentStreak  = 2,
        LastPlayedDate = today.AddDays(-1),
    };
    db.Players.Add(devPlayer);
    db.SaveChanges();

    // Sessions pour J-2 et J-1 (le joueur a joué ces deux jours)
    foreach (var (challenge, dayOffset) in challenges[..2].Select((c, i) => (c, i)))
    {
        db.GameSessions.Add(new GameSession
        {
            PlayerId             = devPlayer.Id,
            DailyChallengeId     = challenge.Id,
            TotalScore           = 2550,
            TotalDurationSeconds = 1.5m,
            CreatedAt            = DateTime.SpecifyKind(days[dayOffset].ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(12))), DateTimeKind.Utc),
        });
    }
    db.SaveChanges();

    return true;
}

// Convertit postgresql://user:pass@host:port/db?sslmode=xxx en format Npgsql key=value
static string BuildNpgsqlConnectionString(string uri)
{
    var u = new Uri(uri);
    var userInfo = u.UserInfo.Split(':');
    var db = u.AbsolutePath.TrimStart('/').Split('?')[0];
    return $"Host={u.Host};Port={u.Port};Database={db};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Require;Trust Server Certificate=true";
}
