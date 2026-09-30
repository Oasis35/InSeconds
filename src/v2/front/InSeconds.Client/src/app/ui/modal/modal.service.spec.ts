import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ModalFrameComponent } from './modal-frame.component';
import { ModalService } from './modal.service';

@Component({
  imports: [ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-modal-frame title="Renommer"><input id="field" /></app-modal-frame>`,
})
class SampleContentComponent {}

describe('ModalService', () => {
  let modal: ModalService;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    modal = TestBed.inject(ModalService);
    opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
  });

  afterEach(() => {
    opener.remove();
    document.querySelectorAll('.cdk-overlay-container').forEach(el => (el.innerHTML = ''));
  });

  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  // Échap est écouté par le CDK sur le document (OverlayKeyboardDispatcher), depuis l'élément qui a le focus.
  const pressEscape = () =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true } as KeyboardEventInit),
    );
  const dialogElement = () => document.querySelector<HTMLElement>('[role="dialog"]');

  it('ouvre une fenêtre accessible, reliée à son titre, avec le focus à l\'intérieur', async () => {
    modal.open(SampleContentComponent);
    await settle();

    const dialog = dialogElement()!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!.split(' ')[0]);
    expect(title?.textContent).toContain('Renommer');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('se ferme avec Échap et rend le focus à l\'élément d\'origine', async () => {
    const ref = modal.open(SampleContentComponent);
    await settle();

    const closed = firstValueFrom(ref.closed);
    pressEscape();
    await closed;
    await settle();

    expect(dialogElement()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('se ferme en cliquant sur le fond', async () => {
    const ref = modal.open(SampleContentComponent);
    await settle();

    const closed = firstValueFrom(ref.closed);
    document.querySelector<HTMLElement>('.app-modal-backdrop')!.click();

    expect(await closed).toBeUndefined();
  });

  it('ferme avec le bouton du cadre', async () => {
    const ref = modal.open(SampleContentComponent);
    await settle();

    const closed = firstValueFrom(ref.closed);
    dialogElement()!.querySelector<HTMLButtonElement>('button[aria-label]')!.click();

    await closed;
    expect(dialogElement()).toBeNull();
  });

  it('ouvre un panneau bas', async () => {
    modal.openSheet(SampleContentComponent);
    await settle();

    expect(document.querySelector('.app-sheet-panel [role="dialog"]')).not.toBeNull();
  });

  describe('confirm', () => {
    const data = { title: 'Abandonner ?', body: 'La partie sera perdue.', confirmLabel: 'Abandonner', cancelLabel: 'Continuer', tone: 'danger' as const };

    async function buttons(): Promise<HTMLButtonElement[]> {
      await settle();
      return [...dialogElement()!.querySelectorAll<HTMLButtonElement>('button.app-button')];
    }

    it('met le focus sur l\'annulation : Entrée par réflexe ne détruit rien', async () => {
      void modal.confirm(data);
      const [, cancel] = await buttons();

      expect(document.activeElement).toBe(cancel);
    });

    it('renvoie true sur confirmation', async () => {
      const answer = modal.confirm(data);
      const [confirm] = await buttons();

      confirm.click();

      expect(await answer).toBe(true);
    });

    it('renvoie false sur annulation ou fermeture', async () => {
      const cancelled = modal.confirm(data);
      (await buttons())[1].click();
      expect(await cancelled).toBe(false);

      const dismissed = modal.confirm(data);
      await settle();
      pressEscape();
      expect(await dismissed).toBe(false);
    });
  });
});
