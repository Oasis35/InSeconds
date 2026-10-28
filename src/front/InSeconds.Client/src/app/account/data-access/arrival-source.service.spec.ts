import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ARRIVAL_SOURCE_KEY, ArrivalSourceService } from './arrival-source.service';

describe('ArrivalSourceService', () => {
  afterEach(() => {
    sessionStorage.removeItem(ARRIVAL_SOURCE_KEY);
    vi.restoreAllMocks();
  });

  function service(href: string, referrer = ''): ArrivalSourceService {
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { location: { href }, referrer } }] });
    return TestBed.inject(ArrivalSourceService);
  }

  it('note le utm_source du lien pour la suite de l\'onglet', () => {
    const arrival = service('https://inseconds.cc/?utm_source=instagram');

    arrival.capture();

    expect(arrival.get()).toBe('instagram');
    expect(sessionStorage.getItem(ARRIVAL_SOURCE_KEY)).toBe('instagram');
  });

  it('note le domaine du référent, jamais son adresse complète', () => {
    const arrival = service('https://inseconds.cc/', 'https://www.google.com/search?q=blind+test');

    arrival.capture();

    expect(arrival.get()).toBe('google.com');
  });

  it('garde la première source de l\'onglet', () => {
    sessionStorage.setItem(ARRIVAL_SOURCE_KEY, 'tiktok');
    const arrival = service('https://inseconds.cc/?utm_source=share');

    arrival.capture();

    expect(arrival.get()).toBe('tiktok');
  });

  it('rien sans source', () => {
    const arrival = service('https://inseconds.cc/daily');

    arrival.capture();

    expect(arrival.get()).toBeNull();
  });

  it('ne lève jamais quand sessionStorage est indisponible', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const arrival = service('https://inseconds.cc/?utm_source=instagram');

    expect(() => arrival.capture()).not.toThrow();
    expect(arrival.get()).toBeNull();
  });
});
