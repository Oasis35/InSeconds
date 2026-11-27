namespace InSeconds.Api.Modules.Players.Contracts;

/// <summary>
/// Les noms qu'un joueur ne peut pas se donner parce qu'ils prêtent à confusion (« Admin », « InSeconds », le nom d'une plateforme musicale…) : le
/// pseudo d'un joueur (Players) comme le nom d'un groupe (Social). Les termes sont un réglage lu à chaud (<c>Players:Reserved…</c>) ; la comparaison
/// ignore la casse, les accents, la ponctuation et les chiffres pris pour des lettres (« 1nSeconds »). Ne s'applique qu'aux saisies des joueurs : la
/// modération de l'admin nomme librement.
/// </summary>
public interface IReservedNames
{
    /// <summary>Ce nom prête-t-il à confusion ? Un texte vide ou nul ne l'est pas (la validation de forme le refuse ailleurs).</summary>
    bool IsReserved(string? name);
}
