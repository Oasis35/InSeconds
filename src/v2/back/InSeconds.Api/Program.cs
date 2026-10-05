using InSeconds.Api.Infrastructure.Hosting;
using JasperFx;

if (MigrateOnlyCommand.IsRequested(args))
    return await MigrateOnlyCommand.RunAsync(args);

if (RotateDataProtectionKeyCommand.IsRequested(args))
    return await RotateDataProtectionKeyCommand.RunAsync(args);

var builder = WebApplication.CreateBuilder(args);
builder.AddInSecondsApi(args);

var app = builder.Build();
app.UseInSecondsApi();

// Démarre l'API, ou exécute une commande Wolverine (ex. « codegen write », qui génère le code des
// handlers sans démarrer l'hôte).
return await app.RunJasperFxCommands(args);

public partial class Program;
