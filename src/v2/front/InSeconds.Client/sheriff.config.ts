import { SheriffConfig } from '@softarc/sheriff-core';

/**
 * Frontières du front v2 (§ 3.3 et § 6.1 du plan v2), vérifiées en CI par `npm run lint:arch`.
 *
 * - `core` : transverse (session, erreurs, langue, version, santé) ; peut utiliser `ui`.
 * - `ui` : kit visuel de la DA, n'importe rien d'autre de l'app.
 * - `api` : clients NSwag, importés seulement par la couche `data-access`.
 * - `environment` : `src/environments` (adresse de l'API, nom de l'environnement).
 * - Un domaine (`daily`, `account`…) a quatre couches : `domain`, `data-access`, `feature`, `ui`.
 * - `gameplay` (la manche) ne connaît aucun mode ; `daily` et `runs` ne s'importent jamais.
 * - `domain/` n'importe rien d'Angular : vérifié à part par `scripts/check-pure-domain.mjs`
 *   (Sheriff ne contrôle que les imports internes).
 *
 * Un module a le droit d'en importer un autre si **chacun** de ses tags autorise au moins un tag
 * de la cible.
 */
const DOMAINS = ['gameplay', 'daily', 'runs', 'account', 'admin', 'home'] as const;
const LAYERS = ['domain', 'data-access', 'feature', 'ui'] as const;

const domainModules = Object.fromEntries(
  DOMAINS.flatMap(domain =>
    LAYERS.map(layer => [`src/app/${domain}/${layer}`, [`domain:${domain}`, `layer:${layer}`]]),
  ),
);

/** Ce que chaque domaine peut importer, en plus de lui-même, de `core`, `ui` et `api`. */
const DOMAIN_DEPENDENCIES: Record<(typeof DOMAINS)[number], string[]> = {
  gameplay: [],
  daily: ['domain:gameplay'],
  runs: ['domain:gameplay'],
  account: [],
  admin: [],
  home: [],
};

export const config: SheriffConfig = {
  version: 1,
  enableBarrelLess: true,
  modules: {
    'src/app/core': ['core'],
    'src/app/ui': ['ui'],
    'src/app/api': ['api'],
    'src/environments': ['environment'],
    ...domainModules,
  },
  depRules: {
    // app.ts, app.config.ts, app.routes.ts : composent tout, chargent les pages des domaines.
    root: ['core', 'ui', 'layer:feature', 'environment'],
    core: ['core', 'ui', 'environment'],
    ui: ['ui'],
    api: ['api', 'environment'],
    environment: [],
    ...Object.fromEntries(
      DOMAINS.map(domain => [`domain:${domain}`, [`domain:${domain}`, ...DOMAIN_DEPENDENCIES[domain], 'core', 'ui', 'api', 'environment']]),
    ),
    'layer:domain': ['layer:domain'],
    'layer:data-access': ['layer:domain', 'layer:data-access', 'api', 'core', 'environment'],
    'layer:feature': ['layer:feature', 'layer:data-access', 'layer:ui', 'layer:domain', 'core', 'ui'],
    'layer:ui': ['layer:ui', 'layer:domain', 'ui'],
  },
};
