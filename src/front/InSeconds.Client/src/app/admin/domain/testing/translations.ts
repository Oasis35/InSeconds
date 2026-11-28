import fr from '../../../../../public/i18n/fr.json';
import en from '../../../../../public/i18n/en.json';

type Tree = { [key: string]: string | Tree };

function has(tree: Tree, path: string): boolean {
  let node: string | Tree | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return false;
    node = node[part];
  }
  return typeof node === 'string' && node.length > 0;
}

/** La clé de traduction existe, non vide, en français et en anglais. */
export function isTranslated(key: string): { fr: boolean; en: boolean } {
  return { fr: has(fr as Tree, key), en: has(en as Tree, key) };
}
