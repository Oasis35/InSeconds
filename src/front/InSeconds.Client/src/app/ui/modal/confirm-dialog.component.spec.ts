import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

const DATA: ConfirmDialogData = { title: 'Abandonner ?', body: 'Ligne 1\nLigne 2', confirmLabel: 'Abandonner', cancelLabel: 'Continuer à jouer' };

describe('ConfirmDialogComponent', () => {
  function render(data: ConfirmDialogData = DATA) {
    TestBed.resetTestingModule();
    const ref = { close: vi.fn(), containerInstance: null };
    TestBed.configureTestingModule({ providers: [provideTranslateService(), { provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: ref }] });
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) => Array.from(element.querySelectorAll('button')).find(b => b.textContent?.trim() === label)!;
    return { element, ref, confirm: () => button(data.confirmLabel), cancel: () => button(data.cancelLabel) };
  }

  it('montre le titre, le corps et les deux libellés déjà traduits', () => {
    const { element, confirm, cancel } = render();

    expect(element.textContent).toContain('Abandonner ?');
    expect(element.querySelector('p')!.textContent).toBe('Ligne 1\nLigne 2');
    expect(confirm()).toBeDefined();
    expect(cancel()).toBeDefined();
  });

  it('le corps garde ses retours à la ligne', () => {
    expect(render().element.querySelector<HTMLElement>('p')!.style.whiteSpace).toBe('pre-line');
  });

  it('confirmer ferme avec vrai', () => {
    const { ref, confirm } = render();

    confirm().click();

    expect(ref.close).toHaveBeenCalledTimes(1);
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('annuler ferme avec faux', () => {
    const { ref, cancel } = render();

    cancel().click();

    expect(ref.close).toHaveBeenCalledTimes(1);
    expect(ref.close).toHaveBeenCalledWith(false);
  });

  it('l\'annulation prend le focus d\'office : Entrée par réflexe ne détruit rien', () => {
    const { confirm, cancel } = render();

    expect(cancel().hasAttribute('cdkfocusinitial')).toBe(true);
    expect(confirm().hasAttribute('cdkfocusinitial')).toBe(false);
  });

  it('une action destructive a un bouton de confirmation « danger », une action ordinaire un bouton plein', () => {
    expect(render({ ...DATA, tone: 'danger' }).confirm().classList).toContain('app-button--danger');
    expect(render({ ...DATA, tone: 'default' }).confirm().classList).toContain('app-button--primary');
    expect(render(DATA).confirm().classList).toContain('app-button--primary');
  });

  it('l\'annulation reste secondaire, quelle que soit la tonalité', () => {
    expect(render({ ...DATA, tone: 'danger' }).cancel().classList).toContain('app-button--secondary');
  });
});
