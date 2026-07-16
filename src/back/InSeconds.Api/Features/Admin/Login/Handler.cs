namespace InSeconds.Api.Features.Admin.Login;

public sealed class LoginHandler(IConfiguration configuration)
{
    public Task<IResult> Handle(LoginCommand command, CancellationToken cancellationToken)
    {
        var adminPassword = configuration["AdminPassword"];

        if (string.IsNullOrEmpty(adminPassword) || command.Password != adminPassword)
            return Task.FromResult(Results.Unauthorized());

        return Task.FromResult(Results.Ok(new { token = LoginEndpoint.AdminToken }));
    }
}
