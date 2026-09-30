using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Health;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Infrastructure.Time;

if (MigrateOnlyCommand.IsRequested(args))
    return await MigrateOnlyCommand.RunAsync(args);

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

builder.AddDatabaseSettings(connectionString);
builder.Services.AddInSecondsDatabase(connectionString);
builder.Services.AddGameCalendar();
builder.Services.AddInSecondsProblemDetails();
builder.Services.AddInSecondsHealthChecks();

var app = builder.Build();

if (app.Configuration.GetValue("Database:MigrateOnStartup", defaultValue: true))
{
    await DatabaseMigrator.MigrateAsync(app.Services);
    // La table infra.settings peut ne pas exister au moment où la configuration a été construite.
    app.Services.GetRequiredService<ISettingsReloader>().Reload();
}

app.UseInSecondsErrorHandling();
app.MapInSecondsHealth();

await app.RunAsync();
return 0;

public partial class Program;
