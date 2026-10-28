import { arrivalSource } from './arrival-source';

describe('arrivalSource', () => {
  const site = 'https://inseconds.cc/daily';

  it('lit le utm_source du lien', () => {
    expect(arrivalSource('https://inseconds.cc/?utm_source=instagram', '')).toBe('instagram');
    expect(arrivalSource('https://inseconds.cc/runs/K7Q2M9?utm_source=share', 'https://www.google.com/')).toBe('share');
  });

  it('sinon le domaine du référent, sans www ni chemin', () => {
    expect(arrivalSource(site, 'https://www.google.com/search?q=blind+test')).toBe('google.com');
    expect(arrivalSource(site, 'https://L.Instagram.com/?u=https%3A%2F%2Finseconds.cc')).toBe('l.instagram.com');
  });

  it('rien sans utm_source ni référent, ou depuis le site lui-même', () => {
    expect(arrivalSource(site, '')).toBeNull();
    expect(arrivalSource('https://inseconds.cc/?utm_source=', '')).toBeNull();
    expect(arrivalSource(site, 'https://inseconds.cc/privacy')).toBeNull();
    expect(arrivalSource(site, 'https://www.inseconds.cc/')).toBeNull();
  });

  it('ignore un référent illisible', () => {
    expect(arrivalSource(site, 'pas une adresse')).toBeNull();
  });
});
