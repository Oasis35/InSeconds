using FluentValidation;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Scoring;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.ResetToday;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Features.Settings.GetSettings;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.FluentValidation;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicyName = "AllowAngular";

var pgUri = Environment.GetEnvironmentVariable("NF_INSECONDS_DB_POSTGRES_URI");
var connectionString = pgUri is not null
    ? BuildNpgsqlConnectionString(pgUri)
    : builder.Configuration.GetConnectionString("DefaultConnection")!;

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

builder.Services.AddMemoryCache();
builder.Services.AddScoped<SettingsService>();

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

app.MapGet("/health", () => Results.Ok(new { status = "ok", utc = DateTime.UtcNow }));

app.MapGetSettings();
app.MapStartSession();
app.MapSubmitAnswer();
app.MapResetToday();

app.Run();

// TODO: Supprimer quand le générateur de défis quotidiens (BackgroundService) sera en place.
static bool SeedDevelopmentData(ApplicationDbContext db)
{
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    if (db.DailyChallenges.Any(c => c.Date == today))
        return false;

    var trackData = new (long Id, string Artist, string Title)[]
    {
        (66609426,  "Daft Punk",       "Get Lucky"),
        (3135553,   "Daft Punk",       "One More Time"),
        (4603408,   "Michael Jackson", "Billie Jean"),
        (4763165,   "Michael Jackson", "Beat It"),
        (414838122, "Orelsan",         "Basique"),
        (1109731,   "Eminem",          "Lose Yourself"),
        (72160314,  "Eminem",          "Rap God"),
        (139470659, "Ed Sheeran",      "Shape of You"),
        (13444256,  "Coldplay",        "Viva La Vida"),
        (10284909,  "Justice",         "D.A.N.C.E."),
    };

    var tracks = trackData.Select(t => new Track
    {
        DeezerTrackId = t.Id,
        Artist        = t.Artist,
        Title         = t.Title,
        CreatedAt     = DateTime.UtcNow,
    }).ToList();

    db.Tracks.AddRange(tracks);
    db.SaveChanges();

    var challenge = new DailyChallenge { Date = today, Seed = today.DayNumber };
    db.DailyChallenges.Add(challenge);
    db.SaveChanges();

    db.DailyChallengeTracks.AddRange(tracks.Select((t, i) => new DailyChallengeTrack
    {
        DailyChallengeId   = challenge.Id,
        TrackId            = t.Id,
        Position           = i + 1,
        DeezerRankSnapshot = i + 1,
    }));
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
