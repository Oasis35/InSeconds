using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Deezer;

/// <summary>
/// Le cache mémoire de Deezer : une instance dédiée, bornée en nombre d'entrées (conteneur à mémoire
/// contrainte, piège 24), pas l'<see cref="IMemoryCache"/> partagé de l'application. Dès qu'une
/// <see cref="MemoryCacheOptions.SizeLimit"/> est posée, chaque entrée doit déclarer sa taille
/// (<c>Size</c>), sinon <c>Set</c> lève une exception à l'exécution : les décorateurs posent <c>Size = 1</c>.
/// </summary>
public sealed class DeezerCache : IDisposable
{
    public const int SizeLimit = 2000;

    private readonly MemoryCache _memory = new(new MemoryCacheOptions { SizeLimit = SizeLimit });

    public IMemoryCache Memory => _memory;

    /// <summary>Vide le cache (remise à zéro de l'hôte de test).</summary>
    public void Clear() => _memory.Clear();

    public void Dispose() => _memory.Dispose();
}
