import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RenameGroupSheet } from './rename-group.sheet';

describe('RenameGroupSheet', () => {
  let close: ReturnType<typeof vi.fn>;

  function render() {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), { provide: DIALOG_DATA, useValue: { name: 'Potes' } }, { provide: DialogRef, useValue: { close } }],
    });
    const fixture = TestBed.createComponent(RenameGroupSheet);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('[data-testid="rename-group-name"]')!;
    const confirm = () => el.querySelector<HTMLButtonElement>('[data-testid="rename-group-confirm"]')!;
    const type = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { el, input, confirm, type, form: el.querySelector('form')! };
  }

  it('part du nom actuel, et rien ne part tant qu\'il n\'a pas changé', () => {
    const { input, confirm } = render();

    expect(input.value).toBe('Potes');
    expect(confirm().disabled).toBe(true);
  });

  it('rend le nouveau nom rogné', () => {
    const { confirm, type, form } = render();

    type('  Les amis ');
    expect(confirm().disabled).toBe(false);
    form.dispatchEvent(new Event('submit'));

    expect(close).toHaveBeenCalledWith('Les amis');
  });

  it('refuse un nom trop court ou aux caractères interdits', () => {
    const { confirm, type, form } = render();

    type('ab');
    expect(confirm().disabled).toBe(true);
    type('Les <amis>');
    expect(confirm().disabled).toBe(true);
    form.dispatchEvent(new Event('submit'));

    expect(close).not.toHaveBeenCalled();
  });

  it('renoncer rend null', () => {
    const { el } = render();

    [...el.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('social.rename.cancel'))!.click();

    expect(close).toHaveBeenCalledWith(null);
  });
});
