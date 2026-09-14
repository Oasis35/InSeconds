using System.Net.Http.Headers;
using FluentValidation;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Email;
using InSeconds.Api.Common.Networking;
using InSeconds.Api.Common.RateLimiting;
using InSeconds.Api.Common.Scoring;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Features.Admin.SendTestEmail;
using InSeconds.Api.Features.Auth.ConfirmEmailChange;
using InSeconds.Api.Features.Auth.RequestEmailChange;
using InSeconds.Api.Features.Auth.RequestMagicLink;
using InSeconds.Api.Features.Auth.VerifyMagicLink;
using InSeconds.Api.Features.Auth.Logout;
using InSeconds.Api.Features.Auth.DevLogin;
using InSeconds.Api.Features.Admin.Challenges.CreateChallenge;
using InSeconds.Api.Features.Admin.GenerateToday;
using InSeconds.Api.Features.Admin.Challenges.DeezerSearch;
using InSeconds.Api.Features.Deezer;
using InSeconds.Api.Features.Admin.Challenges.GetChallenges;
using InSeconds.Api.Features.Admin.Stats.GetAdminStats;
using InSeconds.Api.Features.Admin.Stats.GetChallengeStats;
using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Features.Admin.RefreshPreviews;
using InSeconds.Api.Features.Admin.ResetToday;
using InSeconds.Api.Features.Admin.Tracks.AddTrack;
using InSeconds.Api.Features.Admin.Tracks.DeleteTrack;
using InSeconds.Api.Features.Admin.Tracks.GetTracks;
using InSeconds.Api.Features.Admin.Tracks.UpdateTrack;
using InSeconds.Api.Features.Admin.Settings.UpdateTrackCooldown;
using InSeconds.Api.Features.Players.GetCurrentPlayer;
using InSeconds.Api.Features.Players.UpdatePseudo;
using InSeconds.Api.Features.Stats.Today;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Features.Sessions.AbandonSession;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.GetTodaySession;
using InSeconds.Api.Features.Sessions.UpdateListening;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Features.E2E;
using InSeconds.Api.Features.Settings.GetSettings;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wolverine;
using Wolverine.FluentValidation;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicyName = "AllowAngular";

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")!;

builder.Configuration.Sources.Add(new AppDbConfigurationSource(connectionString));

// AddDbContextFactory enregistre aussi ApplicationDbContext en scoped : les handlers
// classiques gardent l'injection directe, la factory sert aux endpoints qui parallélisent
// plusieurs queries EF (un contexte par query — un DbContext n'est pas thread-safe).
builder.Services.AddDbContextFactory<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Host.UseWolverine(opts =>
{
    opts.ServiceLocationPolicy = JasperFx.CodeGeneration.Model.ServiceLocationPolicy.AllowedButWarn;
    opts.UseRuntimeCompilation();
    opts.UseFluentValidation();
});

// En prod, deux sauts séparent le vrai client de l'API : Cloudflare (edge, DNS proxied) puis
// Caddy (VPS, seul point d'entrée, l'API n'a jamais de port publié sur l'hôte — cf.
// docker-compose.prod.yml). Sans ce middleware, Connection.RemoteIpAddress vaut toujours l'IP
// interne de Caddy, ce qui rendrait les rate limiters ci-dessous inefficaces (DoS trivial) —
// cf. commit qui a introduit ce bloc. Une première version ne peuplait pas KnownIPNetworks
// (vidé, "trust everything" sur le premier saut) avec ForwardLimit=1 par défaut : ça ne
// déroulait qu'UN seul saut, donc Connection.RemoteIpAddress s'arrêtait sur l'IP du edge
// Cloudflare — partagée par des milliers de visiteurs distincts — au lieu de la vraie IP
// cliente. Résultat en prod : le rate limiter admin-login (10 req/5min) se faisait épuiser par
// du trafic sans rapport, et l'admin légitime tombait sur un 429 que le front affiche comme
// "mot de passe incorrect" (message générique pour toute erreur HTTP, cf. piège 27 racine).
// Fix : KnownIPNetworks peuplé (TrustedProxyNetworks, Common/Networking/) avec les plages
// privées RFC1918 (couvre Caddy quelle que soit l'IP Docker lui attribue — non falsifiable
// depuis l'extérieur, la source TCP réelle est vérifiée par le noyau) ET les plages publiques
// Cloudflare (permet de dérouler le saut suivant), + ForwardLimit=null (sûr uniquement parce
// que KnownIPNetworks borne désormais la confiance — recommandation Microsoft). Un attaquant
// qui contournerait Cloudflare pour taper directement sur Caddy (UFW autorise 80/443 au monde
// entier) se retrouve avec sa vraie IP TCP hors de ces deux listes : le déroulement s'arrête
// immédiatement à son IP réelle, non usurpable.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = null;
    foreach (var network in TrustedProxyNetworks.All)
        options.KnownIPNetworks.Add(network);
});

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
        policy.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

// Anti brute-force sur /api/admin/login : le mot de passe admin est un secret unique
// comparé côté serveur sans autre protection (pas de lockout de compte, un seul "compte").
// Fenêtre glissante par IP — volontairement permissif pour ne jamais gêner un admin
// légitime qui retape son mot de passe, mais suffisant pour bloquer un brute-force massif.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(LoginEndpoint.LoginRateLimiterPolicy, httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(5),
                SegmentsPerWindow = 5,
                QueueLimit = 0,
            }));

    // Anti "email bombing" sur /api/auth/magic-link/request : le throttle existant de 60s
    // par email (RequestMagicLinkHandler) n'empêche pas de spammer une victime une fois par
    // minute indéfiniment, ni de solliciter Resend en masse sur des emails différents.
    options.AddPolicy(RequestMagicLinkEndpoint.RateLimiterPolicy, httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(10),
                SegmentsPerWindow = 5,
                QueueLimit = 0,
            }));

    // Anti "email bombing" sur PUT /api/players/me/email : même raisonnement que
    // RequestMagicLink ci-dessus, le throttle de 60s par joueur (RequestEmailChangeHandler)
    // n'empêche pas de solliciter Resend en masse en changeant de nouvelle adresse à chaque
    // appel.
    options.AddPolicy(RequestEmailChangeEndpoint.RateLimiterPolicy, httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(10),
                SegmentsPerWindow = 5,
                QueueLimit = 0,
            }));

    // GetCurrentPlayer (peek=false) et StartSession créent chacun un Player à la demande sans
    // authentification préalable — sans limite, un visiteur qui boucle dessus fait grossir la
    // table Players indéfiniment. Seuil généreux (30/10min) pour ne jamais gêner un vrai joueur
    // qui recharge la page ou relance une partie plusieurs fois.
    options.AddPolicy(RateLimiterPolicies.PlayerCreation, httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(10),
                SegmentsPerWindow = 5,
                QueueLimit = 0,
            }));

    // GET /api/deezer/search (proxy public, pas d'auth) : sans limite, un abus soutenu peut
    // épuiser le quota Deezer partagé par tous les joueurs (previews/covers cassées pour tout
    // le monde). CachedDeezerClient (TTL 1h) atténue déjà les requêtes identiques répétées mais
    // pas une query qui varie à chaque appel. Seuil généreux (60/5min) : l'autocomplete debounce
    // 300ms génère plusieurs requêtes par recherche tapée normalement, potentiellement pour
    // plusieurs joueurs derrière la même IP (NAT partagé).
    options.AddPolicy(SearchEndpoint.RateLimiterPolicy, httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(5),
                SegmentsPerWindow = 5,
                QueueLimit = 0,
            }));
});

builder.Services.AddOptions<AppSettings>()
    .BindConfiguration(AppDbConfigurationProvider.SectionPrefix);
builder.Services.AddSingleton<IPostConfigureOptions<AppSettings>, AppSettingsPostConfigure>();
builder.Services.AddScoped<SettingsService>();
builder.Services.AddScoped<GetTracksHandler>();
builder.Services.AddScoped<LogoutHandler>();
builder.Services.AddScoped<TodayStatsHandler>();
builder.Services.AddScoped<GetTodaySessionHandler>();
builder.Services.AddScoped<DailyChallengeGenerator>();
builder.Services.AddScoped<PreviewStatusRefresher>();
builder.Services.AddHostedService<GenerateDailyChallengeService>();
builder.Services.AddHostedService<RefreshPreviewStatusService>();

builder.Services.AddSingleton<ScoreCalculator>();
builder.Services.AddSingleton<TextNormalizer>();

// SizeLimit par sécurité : évite qu'un pool de morceaux ou un volume de recherches
// admin/joueur en forte hausse ne fasse grossir le cache sans borne avant expiration
// du TTL (conteneur prod à seulement 512 MB, cf. piège OOM 2026-09-08). Chaque entrée
// est comptée pour 1 (URL de preview ou petite liste de résultats de recherche).
builder.Services.AddMemoryCache(options => options.SizeLimit = 2000);
builder.Services.AddTransient<CachedDeezerClient>();

var deezerHttpBuilder = builder.Services.AddHttpClient<DeezerClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Deezer:BaseUrl"] ?? "https://api.deezer.com");
});

if (builder.Environment.IsEnvironment("Testing"))
{
    deezerHttpBuilder.ConfigurePrimaryHttpMessageHandler(() => new FakeDeezerHandler());
}
else
{
    // Résilience HTTP sur l'API Deezer : timeout court par tentative, retry
    // exponentiel (incluant 429/5xx) et circuit breaker. Évite qu'un appel
    // Deezer lent ne bloque StartSession (timeout HttpClient par défaut = 100s).
    deezerHttpBuilder.AddStandardResilienceHandler(options =>
    {
        options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(4);
        options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(15);
        options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
    });
}

// PersistKeysToDbContext : sans persistance, les clés vivent dans le filesystem du
// conteneur et sautent à chaque redéploiement/redémarrage → cookies joueurs invalidés
// (streaks perdues). Cf. piège 17 (résolu).
builder.Services.AddDataProtection()
    .SetApplicationName("InSeconds")
    .PersistKeysToDbContext<ApplicationDbContext>();
builder.Services.AddScoped<ICookieAuthService>(sp => new CookieAuthService(
    sp.GetRequiredService<ApplicationDbContext>(),
    sp.GetRequiredService<IDataProtectionProvider>().CreateProtector("InSeconds.Auth.Cookie"),
    sp.GetRequiredService<IHostEnvironment>()));

builder.Services.AddScoped<IMagicLinkTokenService, MagicLinkTokenService>();
builder.Services.AddScoped<IEmailChangeTokenService, EmailChangeTokenService>();
builder.Services.AddScoped<IAccountLinkingService, AccountLinkingService>();

// Singleton : jetons admin en mémoire, un seul process API sur le VPS (pas de scale-out).
builder.Services.AddSingleton<IAdminTokenStore, AdminTokenStore>();

// ResendEmailSender hors Dev/Testing (config réelle requise) ; NullEmailSender sinon
// (aucune config nécessaire pour développer — logue le contenu de l'email).
builder.Services.AddOptions<ResendOptions>().BindConfiguration("Resend");
if (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
{
    builder.Services.AddSingleton<TestEmailCapture>();
    builder.Services.AddScoped<IEmailSender, NullEmailSender>();
}
else
{
    builder.Services.AddHttpClient<IEmailSender, ResendEmailSender>((sp, client) =>
    {
        var resend = sp.GetRequiredService<IOptions<ResendOptions>>().Value;
        client.BaseAddress = new Uri("https://api.resend.com/");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", resend.ApiKey);
    });
}

builder.Services.AddOpenApi();

// Health checks : /health (liveness, app vivante) et /health/ready (readiness,
// DB joignable). Northflank peut sonder /health/ready pour redémarrer proprement
// si PostgreSQL est inaccessible.
builder.Services.AddHealthChecks()
    .AddDbContextCheck<ApplicationDbContext>("database", tags: ["ready"]);

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

            if (app.Environment.IsDevelopment())
            {
                InSeconds.Api.Features.E2E.E2EResetEndpoint.SeedDevOnlyAccounts(db);
            }
        }
    }
}

// Doit être le tout premier middleware : réécrit HttpContext.Connection.RemoteIpAddress /
// Request.Scheme à partir des en-têtes X-Forwarded-For/-Proto AVANT que quoi que ce soit
// (rate limiter, logs, OriginValidator...) ne lise ces valeurs. Cf. IServiceCollection ci-dessus
// pour le pourquoi des plages KnownIPNetworks (RFC1918 + Cloudflare).
app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Convertit les FluentValidation.ValidationException levées par le pipeline Wolverine
// (opts.UseFluentValidation()) en 400 — nécessaire pour tout endpoint qui invoque un
// handler via bus.InvokeAsync depuis un Minimal API (pas de conversion 400 automatique
// dans ce cas, contrairement aux endpoints Wolverine.Http natifs, non utilisés ici).
app.Use(async (ctx, next) =>
{
    try
    {
        await next(ctx);
    }
    catch (ValidationException ex)
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsJsonAsync(new
        {
            error = "validation_failed",
            errors = ex.Errors.Select(e => new { e.PropertyName, e.ErrorMessage }),
        });
    }
});

app.UseCors(CorsPolicyName);
app.UseRateLimiter();
app.UseMiddleware<PlayerAuthMiddleware>();

var isTesting = app.Environment.IsEnvironment("Testing");

// Liveness : l'app répond. Renvoie un JSON { status, utc, build } consommé par le badge
// d'état backend du front (app.ts) — ne pas changer le format sans adapter le front
// (ajouter un champ est OK). `build` = date UTC de compilation (AssemblyMetadata BuildUtc,
// stampée dans le csproj) : permet de vérifier quelle version tourne en prod.
var buildUtc = typeof(Program).Assembly
    .GetCustomAttributes(typeof(System.Reflection.AssemblyMetadataAttribute), false)
    .Cast<System.Reflection.AssemblyMetadataAttribute>()
    .FirstOrDefault(a => a.Key == "BuildUtc")?.Value ?? "unknown";
app.MapGet("/health", () => Results.Ok(new { status = "ok", utc = DateTime.UtcNow, build = buildUtc }));

// Readiness : la DB est joignable (tag "ready"). Sondé par Northflank.
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
});

app.MapGetSettings();
app.MapGetCurrentPlayer(enableRateLimiting: !isTesting);
app.MapUpdatePseudo();
app.MapTodayStats();
app.MapAddTrack();
app.MapGetTracks();
app.MapDeleteTrack();
app.MapUpdateTrack();
app.MapUpdateTrackCooldown();
app.MapStartSession(enableRateLimiting: !isTesting);
app.MapGetTodaySession();
app.MapSubmitAnswer();
app.MapAbandonSession();
app.MapUpdateListening();
app.MapAdminLogin(enableRateLimiting: !isTesting);
app.MapResetToday();
app.MapGenerateToday();
app.MapRefreshPreviews();
app.MapGetChallenges();
app.MapGetAdminStats();
app.MapGetChallengeStats();
app.MapDeezerSearch();
app.MapDeezerSearchPublic(enableRateLimiting: !isTesting);
app.MapCreateChallenge();
app.MapSendTestEmail();
app.MapRequestMagicLink(enableRateLimiting: !isTesting);
app.MapVerifyMagicLink();
app.MapRequestEmailChange(enableRateLimiting: !isTesting);
app.MapConfirmEmailChange();
app.MapLogout();

if (app.Environment.IsDevelopment())
{
    app.MapDevLoginEndpoint();
}

if (isTesting)
{
    app.MapE2EReset();
}

app.Run();

// Rend Program accessible à WebApplicationFactory dans les tests d'intégration
public partial class Program { }
