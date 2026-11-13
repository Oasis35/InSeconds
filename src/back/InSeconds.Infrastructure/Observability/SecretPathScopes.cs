using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.Infrastructure.Observability;

/// <summary>
/// ASP.NET Core ouvre sur chaque requête un scope de journal avec le chemin brut (<c>RequestPath</c>), que l'export OTLP joint à chaque log
/// (<c>IncludeScopes</c>, indispensable pour le <c>PlayerId</c>). Ce fournisseur de scopes passe ce chemin par <see cref="SecretPaths"/> :
/// un log émis pendant « rejoindre un groupe » ne porte pas le code d'invitation.
/// </summary>
internal sealed class SecretPathScopeProvider(IExternalScopeProvider inner, SecretPaths secretPaths) : IExternalScopeProvider
{
    internal const string RequestPathKey = "RequestPath";

    public IDisposable Push(object? state) => inner.Push(state);

    public void ForEachScope<TState>(Action<object?, TState> callback, TState state) =>
        inner.ForEachScope((scope, st) => callback(Mask(scope), st), state);

    private object? Mask(object? scope)
    {
        if (scope is not IReadOnlyList<KeyValuePair<string, object?>> values)
            return scope;
        for (var i = 0; i < values.Count; i++)
        {
            if (values[i].Key != RequestPathKey || values[i].Value is not string path)
                continue;
            var masked = secretPaths.Mask(path);
            if (masked == path)
                return scope;
            var copy = new KeyValuePair<string, object?>[values.Count];
            for (var j = 0; j < values.Count; j++)
                copy[j] = j == i ? new(RequestPathKey, masked) : values[j];
            return copy;
        }
        return scope;
    }
}

/// <summary>Le fournisseur de logs OpenTelemetry, à qui l'on donne les scopes par <see cref="SecretPathScopeProvider"/>.</summary>
internal sealed class SecretPathLoggerProvider(ILoggerProvider inner, SecretPaths secretPaths) : ILoggerProvider, ISupportExternalScope
{
    internal ILoggerProvider Inner => inner;

    public ILogger CreateLogger(string categoryName) => inner.CreateLogger(categoryName);

    public void SetScopeProvider(IExternalScopeProvider scopeProvider)
    {
        if (inner is ISupportExternalScope supportsScopes)
            supportsScopes.SetScopeProvider(new SecretPathScopeProvider(scopeProvider, secretPaths));
    }

    public void Dispose() => inner.Dispose();
}

internal static class SecretPathLogging
{
    /// <summary>Enveloppe les fournisseurs de logs ajoutés par <paramref name="register"/> (ceux d'OpenTelemetry).</summary>
    internal static void WrapLoggerProviders(IServiceCollection services, SecretPaths secretPaths, Action register)
    {
        var before = services.Where(d => d.ServiceType == typeof(ILoggerProvider)).ToHashSet();
        register();
        var added = services.Where(d => d.ServiceType == typeof(ILoggerProvider) && !before.Contains(d)).ToList();
        foreach (var descriptor in added)
        {
            services.Remove(descriptor);
            services.AddSingleton<ILoggerProvider>(sp => new SecretPathLoggerProvider(Create(descriptor, sp), secretPaths));
        }
    }

    private static ILoggerProvider Create(ServiceDescriptor descriptor, IServiceProvider sp) =>
        (ILoggerProvider)(descriptor.ImplementationInstance
            ?? descriptor.ImplementationFactory?.Invoke(sp)
            ?? ActivatorUtilities.CreateInstance(sp, descriptor.ImplementationType!));
}
