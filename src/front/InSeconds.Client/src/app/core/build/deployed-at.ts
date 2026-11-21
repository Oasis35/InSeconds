/**
 * Heure de déploiement et commit posés à la construction (`ng build --define BUILD_TIME="'…'" --define GIT_COMMIT="'…'"`,
 * cf. `Dockerfile.prod`, valeurs données par `deploy/vps/deploy.sh`) : l'admin les affiche dans son panneau technique (piège 25 du
 * CLAUDE.md racine), et compare le commit à celui de l'API. Absents d'un build local, de `ng serve` et des tests : l'admin n'affiche
 * alors rien.
 */
declare const BUILD_TIME: string | undefined;
declare const GIT_COMMIT: string | undefined;

export const DEPLOYED_AT: string | null = typeof BUILD_TIME === 'string' && BUILD_TIME !== '' ? BUILD_TIME : null;

/** Le commit du front déployé (empreinte complète), `null` hors d'une image de prod ou de staging. */
export const FRONT_COMMIT: string | null = typeof GIT_COMMIT === 'string' && GIT_COMMIT !== '' ? GIT_COMMIT : null;
