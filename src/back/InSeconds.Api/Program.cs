using FluentValidation;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Scoring;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Challenges.CreateChallenge;
using InSeconds.Api.Features.Admin.GenerateToday;
using InSeconds.Api.Features.Admin.Challenges.DeezerSearch;
using InSeconds.Api.Features.Admin.Challenges.GetChallenges;
using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Features.Admin.ResetToday;
using InSeconds.Api.Features.Admin.Tracks.AddTrack;
using InSeconds.Api.Features.Admin.Tracks.GetTracks;
using InSeconds.Api.Features.Auth.Me;
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
app.MapAddTrack();
app.MapGetTracks();
app.MapStartSession();
app.MapSubmitAnswer();
app.MapAdminLogin();
app.MapResetToday();
app.MapGenerateToday();
app.MapGetChallenges();
app.MapDeezerSearch();
app.MapCreateChallenge();

app.Run();

// TODO: Supprimer quand le générateur de défis quotidiens (BackgroundService) sera en place.
static bool SeedDevelopmentData(ApplicationDbContext db)
{
    var today = DateOnly.FromDateTime(DateTime.UtcNow);

    // Un morceau par jour : aujourd'hui + les 9 jours précédents
    var trackData = new (long Id, string Artist, string Title)[]
    {
        (66609426,  "Daft Punk",       "Get Lucky"),          // today
        (3135553,   "Daft Punk",       "One More Time"),      // today - 1
        (4603408,   "Michael Jackson", "Billie Jean"),        // today - 2
        (4763165,   "Michael Jackson", "Beat It"),            // today - 3
        (414838122, "Orelsan",         "Basique"),            // today - 4
        (1109731,   "Eminem",          "Lose Yourself"),      // today - 5
        (72160314,  "Eminem",          "Rap God"),            // today - 6
        (139470659, "Ed Sheeran",      "Shape of You"),       // today - 7
        (13444256,  "Coldplay",        "Viva La Vida"),       // today - 8
        (10284909,  "Justice",         "D.A.N.C.E."),         // today - 9
    };

    // Ne seed que les jours passés sans défi existant (aujourd'hui est géré par le générateur)
    var seeded = false;
    for (var i = 1; i < trackData.Length; i++)
    {
        var date = today.AddDays(-i);
        if (db.DailyChallenges.Any(c => c.Date == date))
            continue;

        var (id, artist, title) = trackData[i];

        var track = db.Tracks.FirstOrDefault(t => t.DeezerTrackId == id)
            ?? new Track { DeezerTrackId = id, Artist = artist, Title = title, CreatedAt = DateTime.UtcNow };

        if (track.Id == 0)
        {
            db.Tracks.Add(track);
            db.SaveChanges();
        }

        var challenge = new DailyChallenge { Date = date, Seed = date.DayNumber };
        db.DailyChallenges.Add(challenge);
        db.SaveChanges();

        db.DailyChallengeTracks.Add(new DailyChallengeTrack
        {
            DailyChallengeId   = challenge.Id,
            TrackId            = track.Id,
            Position           = 1,
            DeezerRankSnapshot = 1,
        });
        db.SaveChanges();
        seeded = true;
    }

    return seeded;
}

// Convertit postgresql://user:pass@host:port/db?sslmode=xxx en format Npgsql key=value
static string BuildNpgsqlConnectionString(string uri)
{
    var u = new Uri(uri);
    var userInfo = u.UserInfo.Split(':');
    var db = u.AbsolutePath.TrimStart('/').Split('?')[0];
    return $"Host={u.Host};Port={u.Port};Database={db};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Require;Trust Server Certificate=true";
}
