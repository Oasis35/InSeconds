using FluentValidation;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Scoring;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
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
using InSeconds.Api.Features.Sessions.AbandonSession;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Features.E2E;
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

var deezerHttpBuilder = builder.Services.AddHttpClient<DeezerClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Deezer:BaseUrl"] ?? "https://api.deezer.com");
});

if (builder.Environment.IsEnvironment("Testing"))
{
    deezerHttpBuilder.ConfigurePrimaryHttpMessageHandler(() => new FakeDeezerHandler());
}

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

    if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
    {
        if (app.Environment.IsEnvironment("Testing"))
        {
            InSeconds.Api.Features.E2E.E2EResetEndpoint.PurgeSeedData(db);
        }

        if (!db.Tracks.Any())
        {
            InSeconds.Api.Features.E2E.E2EResetEndpoint.SeedData(db);
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
app.MapAbandonSession();
app.MapAdminLogin();
app.MapResetToday();
app.MapGenerateToday();
app.MapGetChallenges();
app.MapGetAdminStats();
app.MapDeezerSearch();
app.MapDeezerSearchPublic();
app.MapCreateChallenge();

if (app.Environment.IsEnvironment("Testing"))
{
    app.MapE2EReset();
}

app.Run();

// Convertit postgresql://user:pass@host:port/db?sslmode=xxx en format Npgsql key=value
static string BuildNpgsqlConnectionString(string uri)
{
    var u = new Uri(uri);
    var userInfo = u.UserInfo.Split(':');
    var db = u.AbsolutePath.TrimStart('/').Split('?')[0];
    return $"Host={u.Host};Port={u.Port};Database={db};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Require;Trust Server Certificate=true";
}

// Rend Program accessible à WebApplicationFactory dans les tests d'intégration
public partial class Program { }
