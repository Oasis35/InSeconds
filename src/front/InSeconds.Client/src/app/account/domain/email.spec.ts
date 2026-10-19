import { isPlausibleEmail, normalizeEmail, sameEmail, suggestEmail } from './email';

describe('email', () => {
  it.each(['a@b.fr', 'clement.rageau+inseconds@gmail.com', '  trimmed@example.com  '])('accepte « %s »', email => {
    expect(isPlausibleEmail(email)).toBe(true);
  });

  it.each(['', 'sans-arobase', 'a@b', 'a b@c.fr', '@b.fr', 'a@@b.fr'])('refuse « %s »', email => {
    expect(isPlausibleEmail(email)).toBe(false);
  });

  it('ne s\'enlise pas sur une saisie pathologique', () => {
    const started = performance.now();
    expect(isPlausibleEmail('a@' + 'b'.repeat(50_000))).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('normalise en retirant les espaces autour', () => {
    expect(normalizeEmail('  a@b.fr ')).toBe('a@b.fr');
  });

  it('compare sans tenir compte de la casse ni des espaces autour', () => {
    expect(sameEmail('Clem@Example.com', ' clem@example.com ')).toBe(true);
    expect(sameEmail('a@b.fr', 'c@d.fr')).toBe(false);
    expect(sameEmail(null, '')).toBe(true);
  });

  describe('suggestion de domaine', () => {
    it.each([
      ['clement@gmial.com', 'clement@gmail.com'],
      ['clement@gmail.con', 'clement@gmail.com'],
      ['clement@hotmal.fr', 'clement@hotmail.fr'],
      ['clement@ornage.fr', 'clement@orange.fr'],
      ['clement@wanado.fr', 'clement@wanadoo.fr'],
      ['clement@laposte.ner', 'clement@laposte.net'],
    ])('corrige « %s » en « %s »', (typed, expected) => {
      expect(suggestEmail(typed)).toBe(expected);
    });

    it.each(['clement@gmail.com', 'Clement@Orange.fr', 'clement@free.fr', 'contact@inseconds.cc', 'clemnt@gmail.com'])(
      'ne propose rien pour « %s »',
      email => {
        expect(suggestEmail(email)).toBeNull();
      },
    );

    it('ne propose rien tant que l\'adresse n\'est pas plausible', () => {
      expect(suggestEmail('clement@gmial')).toBeNull();
      expect(suggestEmail('')).toBeNull();
    });

    it('garde la partie avant le « @ » telle quelle', () => {
      expect(suggestEmail('  Jean.Dupont+jeu@gmial.com ')).toBe('Jean.Dupont+jeu@gmail.com');
    });
  });
});
