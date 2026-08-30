namespace InSeconds.Api.Features.Auth.RequestMagicLink;

// Message toujours générique, jamais d'info sur l'existence de l'email (pas d'énumération).
public sealed record RequestMagicLinkResponse(string Message = "Si cet email est autorisé, un lien de connexion vient de lui être envoyé.");
