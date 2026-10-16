import { consumeLegacyUrlFlag } from './legacy-url';

describe('consumeLegacyUrlFlag', () => {
  function fakeLocation(search: string, pathname = '/', hash = ''): Location {
    return { search, pathname, hash } as Location;
  }

  function fakeHistory() {
    return { state: { navigationId: 1 }, replaceState: vi.fn() };
  }

  it('détecte ?from=legacy et le retire de l\'adresse', () => {
    const history = fakeHistory();

    expect(consumeLegacyUrlFlag(fakeLocation('?from=legacy'), history as unknown as History)).toBe(true);
    expect(history.replaceState).toHaveBeenCalledWith(history.state, '', '/');
  });

  it('garde les autres paramètres, le chemin et le fragment', () => {
    const history = fakeHistory();

    consumeLegacyUrlFlag(fakeLocation('?token=abc&from=legacy', '/login/verify', '#top'), history as unknown as History);

    expect(history.replaceState).toHaveBeenCalledWith(history.state, '', '/login/verify?token=abc#top');
  });

  it('ne touche à rien sans le paramètre', () => {
    const history = fakeHistory();

    expect(consumeLegacyUrlFlag(fakeLocation('?from=share'), history as unknown as History)).toBe(false);
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
