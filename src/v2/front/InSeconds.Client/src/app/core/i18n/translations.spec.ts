import fr from '../../../../public/i18n/fr.json';
import en from '../../../../public/i18n/en.json';
import { ERROR_MESSAGE_KEYS, UNKNOWN_ERROR_MESSAGE_KEY } from '../errors/error-messages';

/**
 * Traductions rangées par domaine (§ 6.6 du plan v2) : chaque clé de premier niveau est un
 * domaine connu, et FR/EN ont exactement les mêmes clés. Un domaine qui ajoute ses traductions
 * s'ajoute à `DOMAINS`.
 */
const DOMAINS = ['common', 'errors', 'shell', 'ui', 'gameplay', 'daily', 'account', 'admin', 'privacy'];

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') keys.set(path, value);
    else flatten(value, path).forEach((v, k) => keys.set(k, v));
  }
  return keys;
}

describe('traductions', () => {
  const frKeys = flatten(fr as Tree);
  const enKeys = flatten(en as Tree);

  it('ont les mêmes clés en français et en anglais', () => {
    expect([...enKeys.keys()].filter(k => !frKeys.has(k)), 'clés absentes de fr.json').toEqual([]);
    expect([...frKeys.keys()].filter(k => !enKeys.has(k)), 'clés absentes de en.json').toEqual([]);
  });

  it('ne contiennent aucun texte vide', () => {
    const empty = [...frKeys, ...enKeys].filter(([, value]) => value.trim() === '').map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('sont rangées par domaine', () => {
    for (const translations of [fr, en]) {
      expect(Object.keys(translations).filter(key => !DOMAINS.includes(key))).toEqual([]);
    }
  });

  it('couvrent chaque message de la table des erreurs, dans les deux langues', () => {
    const keys = [...Object.values(ERROR_MESSAGE_KEYS), UNKNOWN_ERROR_MESSAGE_KEY];
    expect(keys.filter(key => !frKeys.has(key) || !enKeys.has(key))).toEqual([]);
  });
});
