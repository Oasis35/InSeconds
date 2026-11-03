import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunClockComponent } from './run-clock.component';

describe('RunClockComponent', () => {
  function render(seconds: number) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunClockComponent);
    fixture.componentRef.setInput('seconds', seconds);
    fixture.detectChanges();
    const clock = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="run-clock"]')!;
    return { fixture, clock };
  }

  it('« 0:45 » discret, en gris, lisible au lecteur d\'écran', () => {
    const { clock } = render(44.2);

    expect(clock.textContent?.trim()).toBe('0:45');
    expect(clock.style.color).toBe('var(--text-muted)');
    expect(clock.hasAttribute('data-alert')).toBe(false);
    expect(clock.getAttribute('aria-label')).toBe('Temps pour répondre : 0:45');
  });

  it('les 5 dernières secondes : un gros chiffre blanc', () => {
    const { fixture, clock } = render(4.3);

    expect(clock.textContent?.trim()).toBe('5');
    expect(clock.hasAttribute('data-alert')).toBe(true);
    expect(clock.style.color).toBe('var(--text-hi)');

    fixture.componentRef.setInput('seconds', 0.4);
    fixture.detectChanges();
    expect(clock.textContent?.trim()).toBe('1');
  });

  it('à zéro, plus d\'alerte', () => {
    const { clock } = render(0);

    expect(clock.hasAttribute('data-alert')).toBe(false);
    expect(clock.textContent?.trim()).toBe('0:00');
  });
});
