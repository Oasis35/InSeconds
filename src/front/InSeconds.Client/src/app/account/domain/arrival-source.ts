/**
 * D'où arrive le visiteur, lu une fois à l'ouverture de l'application : le `utm_source` de son lien
 * (`instagram`, `share`…), sinon le domaine du site qui l'a envoyé (`google.com`), jamais l'adresse
 * complète ; `null` s'il arrive sans l'un ni l'autre, ou depuis le site lui-même. Le serveur nettoie
 * la valeur (format strict, `other` sinon) : rien n'est filtré ici au-delà du domaine.
 */
export function arrivalSource(href: string, referrer: string): string | null {
  const url = parseUrl(href);
  const utm = url?.searchParams.get('utm_source')?.trim();
  if (utm) return utm;

  const from = parseUrl(referrer);
  if (!from?.hostname) return null;
  const host = withoutWww(from.hostname.toLowerCase());
  return url && host === withoutWww(url.hostname.toLowerCase()) ? null : host;
}

function parseUrl(value: string): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function withoutWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}
