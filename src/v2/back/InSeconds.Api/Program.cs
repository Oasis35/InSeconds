using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Health;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Infrastructure.Messaging;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Infrastructure.Time;
using JasperFx;

if (MigrateOnlyCommand.IsRequested(args))
    return await MigrateOnlyCommand.RunAsync(args);

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

// Réglages lus en base, sauf pour une commande qui ne démarre pas l'API (la CI génère le code
// Wolverine sans base).
if (CommandLine.StartsServer(args))
    builder.AddDatabaseSettings(connectionString);
builder.Services.AddInSecondsDatabase(connectionString);
// Enregistré avant Wolverine et Hangfire : les migrations passent avant leur démarrage.
builder.Services.AddDatabaseMigrationOnStartup();
builder.Services.AddGameCalendar();
builder.Services.AddInSecondsProblemDetails();
builder.Services.AddInSecondsHealthChecks();
builder.Services.AddInSecondsAuth();
builder.AddInSecondsWolverine(connectionString);
builder.Services.AddInSecondsJobs(connectionString, builder.Configuration);

var app = builder.Build();

app.UseInSecondsErrorHandling();
app.UseAuthentication();
app.UseAuthorization();
app.MapInSecondsHealth();
app.MapInSecondsEndpoints();
app.MapInSecondsJobsDashboard();

// Démarre l'API, ou exécute une commande Wolverine (ex. « codegen write », qui génère le code des
// handlers sans démarrer l'hôte).
return await app.RunJasperFxCommands(args);

public partial class Program;
