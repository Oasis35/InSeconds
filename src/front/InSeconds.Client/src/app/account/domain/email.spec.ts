import { isPlausibleEmail, normalizeEmail, sameEmail } from './email';

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
});
