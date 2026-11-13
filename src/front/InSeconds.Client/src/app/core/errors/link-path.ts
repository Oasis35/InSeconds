/**
 * Les chemins qui portent un code de lien (invitation d'un groupe, playlist d'un ami) : le code est remplacé par `{code}` avant d'être remonté
 * (un code lu dans Grafana suffirait à rejoindre le groupe). Les mêmes préfixes sont masqués par l'API (`LinkSecrets`).
 */
const SECRET_PREFIXES = ['/api/social/invitations/', '/api/runs/challenges/', '/ranking/join/', '/setlist/', '/runs/'];
/** Les pages qui ne sont pas des codes. */
const KEPT_SEGMENTS = new Set(['history', 'hits']);

/** Masque un chemin (« /setlist/K7P2QX ») ou une adresse complète (« https://api…/api/social/invitations/ABCD2345/join ») : l'origine est gardée. */
export function maskLinkCodes(path: string): string {
  const origin = /^https?:\/\/[^/?#]+/i.exec(path)?.[0] ?? '';
  return origin + maskPath(path.slice(origin.length));
}

function maskPath(path: string): string {
  const lower = path.toLowerCase();
  for (const prefix of SECRET_PREFIXES) {
    if (!lower.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const end = rest.indexOf('/');
    const segment = end < 0 ? rest : rest.slice(0, end);
    if (!segment || KEPT_SEGMENTS.has(segment.toLowerCase())) continue;
    return prefix + '{code}' + (end < 0 ? '' : rest.slice(end));
  }
  return path;
}
