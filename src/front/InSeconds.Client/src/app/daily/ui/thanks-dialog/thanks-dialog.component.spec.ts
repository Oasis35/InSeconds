import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ThanksDialogComponent, ThanksDialogData } from './thanks-dialog.component';

describe('ThanksDialogComponent', () => {
  function render(overrides: Partial<ThanksDialogData> = {}) {
    const close = vi.fn();
    const challenge = vi.fn();
    const data: ThanksDialogData = { games: 2550, lang: 'fr', challenge, ...overrides };
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), { provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: { close } }],
    });
    const fixture = TestBed.createComponent(ThanksDialogComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) => Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes(text))!;
    return { fixture, el, close, challenge, button };
  }

  it('écrit le nombre de parties dans la langue du joueur, en gras', () => {
    const fr = render().el.querySelector('strong')!.textContent!;
    // Sans fichier de traduction, la clé s'affiche ; le chiffre est passé en paramètre.
    expect(fr).toContain('daily.thanks.games');
    TestBed.resetTestingModule();
    const { fixture } = render({ games: 12340, lang: 'en' });
    expect((fixture.componentInstance as unknown as { games: string }).games).toBe('12,340');
  });

  it('sans chiffre, le message se dit autrement', () => {
    const { el } = render({ games: null });
    expect(el.textContent).toContain('daily.thanks.feedbackNoCount');
    expect(el.textContent).not.toContain('daily.thanks.games');
  });

  it('met « nouveau mode de jeu » en gras et signe Clément', () => {
    const { el } = render();
    expect(Array.from(el.querySelectorAll('strong')).map(s => s.textContent?.trim())).toContain('daily.thanks.newMode');
    expect(el.textContent).toContain('Clément');
  });

  it('« Défie un ami » lance le partage dans le clic, puis ferme', () => {
    const { button, challenge, close } = render();
    button('daily.thanks.challenge').click();
    expect(challenge).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('« Continuer » et la croix ferment sans partager', () => {
    const { el, button, challenge, close } = render();
    button('daily.thanks.continue').click();
    el.querySelector<HTMLButtonElement>('button[aria-label]')!.click();
    expect(close).toHaveBeenCalledTimes(2);
    expect(challenge).not.toHaveBeenCalled();
  });
});
