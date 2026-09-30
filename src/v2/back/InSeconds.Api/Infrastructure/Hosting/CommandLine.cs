namespace InSeconds.Api.Infrastructure.Hosting;

public static class CommandLine
{
    /// <summary>
    /// Vrai quand la ligne de commande démarre l'API (aucune commande, des options seules ou <c>run</c>),
    /// faux pour une commande Wolverine comme <c>codegen write</c>, qui n'a pas besoin de la base.
    /// </summary>
    public static bool StartsServer(string[] args) =>
        args.Length == 0 || args[0].StartsWith('-') || args[0] == "run";
}
