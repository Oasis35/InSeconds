import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ManageGroupSheet } from './manage-group.sheet';

describe('ManageGroupSheet', () => {
  let close: ReturnType<typeof vi.fn>;

  function render(canTransfer: boolean) {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), { provide: DIALOG_DATA, useValue: { canTransfer } }, { provide: DialogRef, useValue: { close } }],
    });
    const fixture = TestBed.createComponent(ManageGroupSheet);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { el, find: (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`) };
  }

  it('propose renommer et changer de créateur, et rend le choix', () => {
    const { find } = render(true);

    find('manage-rename')!.click();
    find('manage-transfer')!.click();

    expect(close).toHaveBeenNthCalledWith(1, 'rename');
    expect(close).toHaveBeenNthCalledWith(2, 'transfer');
  });

  it('seul dans le groupe : pas de changement de créateur', () => {
    const { find } = render(false);

    expect(find('manage-rename')).not.toBeNull();
    expect(find('manage-transfer')).toBeNull();
  });

  it('fermer rend null', () => {
    const { el } = render(true);

    [...el.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('social.manage.close'))!.click();

    expect(close).toHaveBeenCalledWith(null);
  });
});
