using InSeconds.Api.Modules.Social.Application;
using InSeconds.Api.Modules.Social.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.UnitTests.Social;

public class AliasConflictExceptionHandlerTests
{
    [Fact]
    public void UniciteDeLAlias_AliasPris() =>
        Assert.Equal(
            SocialErrorCodes.AliasTaken,
            AliasConflictExceptionHandler.ProblemFor(UniqueViolation("ix_ranking_identity_alias"))?.Extensions["code"]?.ToString());

    [Fact]
    public void AutreIndexUnique_PasPourCeGestionnaire() =>
        Assert.Null(AliasConflictExceptionHandler.ProblemFor(UniqueViolation("ix_accounts_pseudo")));

    [Fact]
    public void AutreErreur_PasPourCeGestionnaire() =>
        Assert.Null(AliasConflictExceptionHandler.ProblemFor(new DbUpdateException("x", new InvalidOperationException())));

    private static DbUpdateException UniqueViolation(string constraint) =>
        new("x", new PostgresException("duplicate key", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation, constraintName: constraint));
}
