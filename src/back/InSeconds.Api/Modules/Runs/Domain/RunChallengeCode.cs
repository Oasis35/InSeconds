using System.Security.Cryptography;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Le code d'un défi, qui est son lien (<c>/runs/K7Q2M9</c>) : 6 caractères tirés par <see cref="RandomNumberGenerator"/> dans un alphabet sans
/// ambiguïté (ni 0/O, ni 1/I/L), en majuscules. La saisie est insensible à la casse.
/// </summary>
public static class RunChallengeCode
{
    public const int Length = 6;

    public const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    public static string Generate() => RandomNumberGenerator.GetString(Alphabet, Length);

    /// <summary>Le code tel que le stocke la base (majuscules, espaces retirés), ou <c>null</c> si ce n'est pas un code possible.</summary>
    public static string? Normalize(string? input)
    {
        var code = input?.Trim().ToUpperInvariant();
        return code is { Length: Length } && code.All(c => Alphabet.Contains(c, StringComparison.Ordinal)) ? code : null;
    }
}
