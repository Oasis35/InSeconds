import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EMPTY_STREAK, Streak } from '../../domain/streak';
import { StreakSheetComponent, StreakSheetData } from './streak-sheet.component';

const ACTIVE: Streak = { ...EMPTY_STREAK, streak: 12, freezes: 1, maxFreezes: 2, freezeEveryDays: 7, nextFreezeInDays: 2 };

describe('StreakSheetComponent', () => {
  function render(overrides: Partial<StreakSheetData> = {}) {
    const close = vi.fn();
    const data: StreakSheetData = { streak: ACTIVE, linked: true, lang: 'fr', ...overrides };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(StreakSheetComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      el, close,
      root: () => el.querySelector('[data-testid="streak-sheet"]')!,
      buttons: () => Array.from(el.querySelectorAll('button')),
    };
  }

  it('variante linked pour une série active connectée', () => {
    expect(render().root().getAttribute('data-variant')).toBe('linked');
  });

  it('variante protected quand un gel couvre le jour manqué', () => {
    const { root } = render({ streak: { ...ACTIVE, status: 'protected', missedDays: 1, lastPlayedDate: '2026-10-05' } });
    expect(root().getAttribute('data-variant')).toBe('protected');
  });

  it('variante guest pour un invité, quel que soit le statut', () => {
    const { root } = render({ linked: false, streak: { ...ACTIVE, status: 'protected' } });
    expect(root().getAttribute('data-variant')).toBe('guest');
  });

  it('linked : progression vers le prochain gel (71 %), fermer renvoie close', () => {
    const { el, buttons, close } = render();
    expect((el.querySelector('div[style*="gradient-ice"]') as HTMLElement).style.width).toBe('71%');
    buttons()[0].click();
    expect(close).toHaveBeenCalledWith('close');
  });

  it('stock au plafond : pas de barre de progression', () => {
    const { el } = render({ streak: { ...ACTIVE, freezes: 2 } });
    expect(el.querySelector('div[style*="gradient-ice"]')).toBeNull();
  });

  it('protected : frise (jours joués, gel, aujourd\'hui) et « Jouer maintenant »', () => {
    const { el, buttons, close } = render({ streak: { ...ACTIVE, status: 'protected', missedDays: 1, lastPlayedDate: '2026-10-05' } });
    expect(el.textContent).toContain('✓');
    expect(el.querySelectorAll('app-streak-icon').length).toBeGreaterThan(2);
    buttons()[0].click();
    expect(close).toHaveBeenCalledWith('playNow');
  });

  it('guest : « Créer un compte » renvoie signup, « Plus tard » close', () => {
    const { buttons, close } = render({ linked: false });
    buttons()[0].click();
    expect(close).toHaveBeenLastCalledWith('signup');
    buttons()[1].click();
    expect(close).toHaveBeenLastCalledWith('close');
  });
});
