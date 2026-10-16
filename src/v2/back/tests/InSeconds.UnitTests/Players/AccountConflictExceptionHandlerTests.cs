using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.UnitTests.Players;

public class AccountConflictExceptionHandlerTests
{
    [Fact]
    public void UniciteDuPseudo_PseudoPris() =>
        Assert.Equal(PlayersErrorCodes.PseudoTaken, Code(UniqueViolation("ix_accounts_pseudo")));

    [Fact]
    public void UniciteDeLAdresse_AdressePrise() =>
        Assert.Equal(PlayersErrorCodes.EmailTaken, Code(UniqueViolation("ix_accounts_email")));

    [Fact]
    public void AutreIndexUnique_PasPourCeGestionnaire() =>
        Assert.Null(AccountConflictExceptionHandler.ProblemFor(UniqueViolation("ix_auth_tokens_token_hash")));

    [Fact]
    public void AutreErreur_PasPourCeGestionnaire() =>
        Assert.Null(AccountConflictExceptionHandler.ProblemFor(new DbUpdateException("x", new InvalidOperationException())));

    private static string? Code(Exception exception) =>
        AccountConflictExceptionHandler.ProblemFor(exception)?.Extensions["code"]?.ToString();

    private static DbUpdateException UniqueViolation(string constraint) =>
        new("x", new PostgresException("duplicate key", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation, constraintName: constraint));
}
