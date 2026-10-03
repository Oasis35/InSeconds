using InSeconds.Api.Modules.Players.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.UnitTests.Players;

public class PseudoTakenExceptionHandlerTests
{
    [Fact]
    public void UniciteDuPseudo_Reconnue() =>
        Assert.True(PseudoTakenExceptionHandler.IsPseudoTaken(UniqueViolation("ix_accounts_pseudo")));

    [Fact]
    public void AutreIndexUnique_PasUnPseudoPris() =>
        Assert.False(PseudoTakenExceptionHandler.IsPseudoTaken(UniqueViolation("ix_accounts_email")));

    [Fact]
    public void AutreErreur_PasUnPseudoPris() =>
        Assert.False(PseudoTakenExceptionHandler.IsPseudoTaken(new DbUpdateException("x", new InvalidOperationException())));

    private static DbUpdateException UniqueViolation(string constraint) =>
        new("x", new PostgresException("duplicate key", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation, constraintName: constraint));
}
