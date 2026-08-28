namespace InSeconds.Api.Domain;

public enum SessionStatus
{
    Pending   = 0,
    Completed = 1,
    Abandoned = 2,
    /// <summary>
    /// Session Pending qui n'a jamais été terminée et que l'expiry paresseuse
    /// (au prochain StartSession du joueur) a basculée. Distinct d'<see cref="Abandoned"/>
    /// qui est réservé au clic explicite sur le bouton « Abandonner ».
    /// </summary>
    Expired   = 3,
}
