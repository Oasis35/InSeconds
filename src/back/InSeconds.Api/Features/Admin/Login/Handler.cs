using System.Security.Cryptography;
using System.Text;

namespace InSeconds.Api.Features.Admin.Login;

public sealed class LoginHandler(IConfiguration configuration)
{
    public Task<IResult> Handle(LoginCommand command, CancellationToken cancellationToken)
    {
        var adminPassword = configuration["AdminPassword"];

        if (string.IsNullOrEmpty(adminPassword) || !PasswordEquals(command.Password, adminPassword))
            return Task.FromResult(Results.Unauthorized());

        return Task.FromResult(Results.Ok(new { token = LoginEndpoint.AdminToken }));
    }

    // Comparaison en temps constant : un simple "!=" sur string court-circuite au premier
    // octet différent, ce qui expose (en théorie) une attaque temporelle permettant de
    // reconstituer le mot de passe caractère par caractère.
    private static bool PasswordEquals(string candidate, string expected) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(candidate),
            Encoding.UTF8.GetBytes(expected));
}
