import { ThemeHealth } from '../../domain/themes';

/** La couleur de chaque état : rouge (pas proposé en jeu), jaune (peu varié), vert (varié). */
export const HEALTH_COLOR: Readonly<Record<ThemeHealth, string>> = {
  unplayable: 'var(--color-fail)',
  thin: 'var(--color-warn)',
  varied: 'var(--color-success)',
};
