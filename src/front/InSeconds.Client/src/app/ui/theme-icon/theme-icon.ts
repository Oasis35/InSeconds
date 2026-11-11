import { THEME_ICONS, ThemeIconEntry } from './theme-icons.data';

export { THEME_ICON_CATEGORIES, THEME_ICONS } from './theme-icons.data';
export type { ThemeIconEntry } from './theme-icons.data';

const BY_NAME = new Map<string, ThemeIconEntry>(THEME_ICONS.map(icon => [icon.name, icon]));

/** L'icône du stock à ce nom Lucide, `null` si le nom n'y est pas (une icône retirée du stock ne casse rien : on n'en montre pas). */
export function themeIconByName(name: string | null | undefined): ThemeIconEntry | null {
  return name ? (BY_NAME.get(name) ?? null) : null;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Les icônes dont le nom ou les mots-clés contiennent la recherche (sans accents ni casse), dans la catégorie choisie si elle l'est. */
export function filterThemeIcons(query: string, category: string | null): readonly ThemeIconEntry[] {
  const needle = fold(query.trim());
  return THEME_ICONS.filter(icon => (category === null || icon.category === category)
    && (needle === '' || fold(`${icon.name} ${icon.keywords}`).includes(needle)));
}
