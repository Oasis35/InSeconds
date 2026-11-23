import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { LeaveOwnerSheet } from './leave-owner.sheet';

describe('LeaveOwnerSheet', () => {
  let close: ReturnType<typeof vi.fn>;

  function render() {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        { provide: DIALOG_DATA, useValue: { title: 'Titre', body: 'Corps', confirmLabel: 'Désigner', members: ['Théo', 'Sam'] } },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(LeaveOwnerSheet);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      el,
      options: () => [...el.querySelectorAll<HTMLElement>('[data-testid="leave-successor"]')],
      confirm: () => el.querySelector<HTMLButtonElement>('[data-testid="leave-owner-confirm"]')!,
      refresh: () => fixture.detectChanges(),
    };
  }

  it('propose les autres membres, et rien ne part tant qu\'aucun n\'est choisi', () => {
    const { options, confirm } = render();

    expect(options().map(option => option.textContent?.trim())).toEqual(['Théo', 'Sam']);
    expect(confirm().disabled).toBe(true);
  });

  it('rend le pseudo choisi', () => {
    const { options, confirm, refresh } = render();

    options()[1].click();
    refresh();
    expect(options()[1].getAttribute('aria-checked')).toBe('true');
    expect(confirm().disabled).toBe(false);
    confirm().click();

    expect(close).toHaveBeenCalledWith('Sam');
  });

  it('renoncer rend null', () => {
    const { el } = render();

    [...el.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('social.leave.cancel'))!.click();

    expect(close).toHaveBeenCalledWith(null);
  });
});
