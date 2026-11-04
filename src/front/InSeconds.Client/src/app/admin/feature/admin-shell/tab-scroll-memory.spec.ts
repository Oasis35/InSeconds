import { TestBed } from '@angular/core/testing';
import { Event, NavigationEnd, NavigationStart, Router, Scroll } from '@angular/router';
import { Subject } from 'rxjs';
import { adminTabOf, rememberTabScroll } from './tab-scroll-memory';

describe('adminTabOf', () => {
  it('lit l\'onglet d\'une adresse de l\'admin, sans la requête ni le fragment', () => {
    expect(adminTabOf('/admin/joueurs')).toBe('joueurs');
    expect(adminTabOf('/admin/defis?mois=2026-10')).toBe('defis');
    expect(adminTabOf('/admin/catalogue#haut')).toBe('catalogue');
  });

  it('rien hors d\'un onglet de l\'admin', () => {
    expect(adminTabOf('/admin')).toBeNull();
    expect(adminTabOf('/daily')).toBeNull();
  });
});

describe('rememberTabScroll', () => {
  // Le routeur de test ne lance pas son propre défilement (il ne démarre qu'avec l'application) : ses événements sont joués à la main,
  // dans l'ordre de l'application (NavigationStart, puis NavigationEnd suivi de Scroll), et le retour en haut est fait comme lui.
  let events: Subject<Event>;
  let navigationId = 0;
  let spacer: HTMLElement;

  beforeEach(() => {
    events = new Subject<Event>();
    spacer = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'height: 5000px' }));
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { url: '/admin/joueurs', events } }] });
    TestBed.runInInjectionContext(() => rememberTabScroll());
  });

  afterEach(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    spacer.remove();
  });

  /** Une navigation : la position est notée au départ, le routeur remonte en haut, puis l'événement `Scroll`. */
  async function navigate(url: string): Promise<void> {
    navigationId += 1;
    events.next(new NavigationStart(navigationId, url));
    window.scrollTo({ top: 0, behavior: 'instant' });
    events.next(new Scroll(new NavigationEnd(navigationId, url, url), null, null));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }

  it('retrouve un onglet déjà vu là où on l\'avait laissé, et arrive en haut d\'un onglet pas encore vu', async () => {
    window.scrollTo({ top: 1200, behavior: 'instant' });

    await navigate('/admin/defis');
    expect(window.scrollY).toBe(0);

    await navigate('/admin/joueurs');
    expect(window.scrollY).toBe(1200);
  });

  it('un changement d\'adresse dans le même onglet garde la règle du site : retour en haut', async () => {
    window.scrollTo({ top: 800, behavior: 'instant' });

    await navigate('/admin/joueurs?filtre=x');

    expect(window.scrollY).toBe(0);
  });
});
