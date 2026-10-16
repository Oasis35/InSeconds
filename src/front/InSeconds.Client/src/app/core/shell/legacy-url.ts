/**
 * `nginx.conf` redirige l'ancienne adresse du front (`…code.run`) en 301 vers
 * `https://inseconds.cc?from=legacy`. Au démarrage, on retire ce paramètre de l'adresse (pas de
 * ré-affichage au rechargement, pas de `from=legacy` dans un lien partagé) et on indique s'il
 * était là, pour afficher l'avis « l'adresse a changé ». Appelé avant la première navigation du
 * router : la redirection `/` → `/daily` voit déjà l'adresse nettoyée.
 */
export function consumeLegacyUrlFlag(location: Location, history: History): boolean {
  const params = new URLSearchParams(location.search);
  if (params.get('from') !== 'legacy') return false;

  params.delete('from');
  const query = params.toString();
  history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  return true;
}
