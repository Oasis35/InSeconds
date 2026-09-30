import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { provideTranslateService } from '@ngx-translate/core';
import { NEVER } from 'rxjs';
import { App } from './app';
import { HealthService } from './core/health/health.service';

type TestWindow = Window & { __disableAnimations?: boolean; __disableHealthPolling?: boolean };

describe('App', () => {
  const isDown = signal(false);
  const health = { isDown, start: vi.fn() };

  beforeEach(() => {
    isDown.set(false);
    health.start.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: HealthService, useValue: health },
        { provide: SwUpdate, useValue: { isEnabled: false, versionUpdates: NEVER, unrecoverable: NEVER } },
      ],
    });
  });

  afterEach(() => {
    delete (window as TestWindow).__disableAnimations;
    delete (window as TestWindow).__disableHealthPolling;
    document.documentElement.classList.remove('no-anim');
  });

  it('sonde l\'API et affiche l\'overlay « Service indisponible » quand elle est KO', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(health.start).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-testid="service-down"]')).toBeNull();

    isDown.set(true);
    await fixture.whenStable();

    expect(element.querySelector('[data-testid="service-down"]')).not.toBeNull();
  });

  it('ne sonde pas l\'API sous le drapeau E2E __disableHealthPolling', () => {
    (window as TestWindow).__disableHealthPolling = true;

    TestBed.createComponent(App);

    expect(health.start).not.toHaveBeenCalled();
  });

  it('pose la classe no-anim sous le drapeau E2E __disableAnimations', () => {
    (window as TestWindow).__disableAnimations = true;

    TestBed.createComponent(App);

    expect(document.documentElement.classList.contains('no-anim')).toBe(true);
  });

  it('affiche l\'avis d\'ancienne adresse avec ?from=legacy, puis le ferme', async () => {
    const original = window.location.pathname + window.location.search;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?from=legacy`);
    try {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();

      expect(window.location.search).toBe('');
      // Ouvert par ModalService : rendu dans l'overlay du CDK, hors de l'élément de l'app.
      const notice = document.querySelector('app-legacy-url-notice');
      expect(notice).not.toBeNull();
      expect(notice!.closest('[role="dialog"]')?.getAttribute('aria-labelledby')).toBeTruthy();

      notice!.querySelector<HTMLButtonElement>('[modalActions] button')!.click();
      await fixture.whenStable();

      expect(document.querySelector('app-legacy-url-notice')).toBeNull();
    } finally {
      window.history.replaceState(window.history.state, '', original);
    }
  });
});
