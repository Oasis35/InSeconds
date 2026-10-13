using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Logging;

namespace InSeconds.UnitTests.Infrastructure;

public class DatabaseLoggingTests
{
    [Theory]
    [MemberData(nameof(EcrituresRefusees))]
    public void EcritureRefuseeParLaBase_JournaliseeEnWarning(int eventId)
    {
        var options = DatabaseServiceCollectionExtensions
            .Configure(new DbContextOptionsBuilder(), "Host=db;Database=inseconds")
            .Options;

        var warnings = options.FindExtension<CoreOptionsExtension>()!.WarningsConfiguration;

        Assert.Equal(LogLevel.Warning, warnings.GetLevel(new EventId(eventId)));
    }

    public static TheoryData<int> EcrituresRefusees() =>
    [
        CoreEventId.SaveChangesFailed.Id,
        RelationalEventId.CommandError.Id,
    ];
}
