using System.Runtime.CompilerServices;

namespace InSeconds.UnitTests.Support;

internal static class DiagWarmup
{
    [ModuleInitializer]
    internal static void Run()
    {
        if (Environment.GetEnvironmentVariable("DIAG_WARMUP") != "1") return;
        try { throw new InvalidOperationException("warmup"); }
        catch (InvalidOperationException) { }
    }
}
