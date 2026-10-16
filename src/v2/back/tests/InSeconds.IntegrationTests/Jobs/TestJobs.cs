using Hangfire;
using InSeconds.Api.Infrastructure.Jobs;

namespace InSeconds.IntegrationTests.Jobs;

public sealed class SucceedingJob : IScheduledJob
{
    public Task<object?> RunAsync(CancellationToken cancellationToken) =>
        Task.FromResult<object?>(new { Checked = 3, Updated = 1 });
}

public sealed class FailingJob : IScheduledJob
{
    public const string Code = "test.pool_insufficient";

    [AutomaticRetry(Attempts = 0)]
    public Task<object?> RunAsync(CancellationToken cancellationToken) => throw new JobFailedException(Code);
}

public sealed class CrashingJob : IScheduledJob
{
    public const string SecretDetail = "détail interne à ne jamais renvoyer";

    [AutomaticRetry(Attempts = 0)]
    public Task<object?> RunAsync(CancellationToken cancellationToken) => throw new InvalidOperationException(SecretDetail);
}

public sealed class RetryingJob : IScheduledJob
{
    [AutomaticRetry(Attempts = 1, DelaysInSeconds = [3600])]
    public Task<object?> RunAsync(CancellationToken cancellationToken) => throw new JobFailedException(FailingJob.Code);
}
