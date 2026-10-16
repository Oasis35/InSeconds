/**
 * Heure de déploiement posée à la construction (`ng build --define BUILD_TIME="'…'"`, cf. `Dockerfile.prod`) :
 * l'admin l'affiche sous son titre (piège 25 du CLAUDE.md racine). Absente d'un build local, de
 * `ng serve` et des tests : l'admin n'affiche alors rien.
 */
declare const BUILD_TIME: string | undefined;

export const DEPLOYED_AT: string | null = typeof BUILD_TIME === 'string' && BUILD_TIME !== '' ? BUILD_TIME : null;
