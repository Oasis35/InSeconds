import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ShareService } from '../../../core/share/share.service';
import { FakeSocialApi, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { signIn } from '../testing/session';
import { NewGroupPage } from './new-group.page';

describe('NewGroupPage', () => {
  let api: FakeSocialApi;
  let shared: string[];
  let navigate: ReturnType<typeof vi.spyOn>;

  function render(who: 'account' | 'guest' = 'account') {
    api = new FakeSocialApi();
    shared = [];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]), provideFakeSocialApi(api),
        { provide: ShareService, useValue: { share: (text: string) => { shared.push(text); return Promise.resolve('shared'); } } },
      ],
    });
    signIn(who);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NewGroupPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const submit = async (name: string) => {
      const input = el.querySelector<HTMLInputElement>('[data-testid="new-group-name"]')!;
      input.value = name;
      input.dispatchEvent(new Event('input'));
      el.querySelector<HTMLFormElement>('[data-testid="new-group"]')!.dispatchEvent(new Event('submit'));
      await new Promise(resolve => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { el, submit };
  }

  const error = (el: HTMLElement) => el.querySelector('[data-testid="new-group-error"]')?.textContent?.trim();

  it('« Créer et inviter » crée le groupe, partage son lien puis ouvre son classement', async () => {
    const { submit } = render();

    await submit('Potes');

    expect(api.calls).toEqual(['create:Potes']);
    expect(shared[0]).toContain('/ranking/join/ABCD2345');
    expect(navigate).toHaveBeenCalledWith(['/ranking'], { queryParams: { group: 4 }, replaceUrl: true });
  });

  it('un nom trop court ou aux caractères interdits est refusé sans appel', async () => {
    const { el, submit } = render();

    await submit('ab');

    expect(api.calls).toEqual([]);
    expect(error(el)).toBe('errors.social.invalid_name');
  });

  it.each([
    ['invalid_name', 'errors.social.invalid_name'], ['too_many_groups', 'social.create.tooMany'], ['error', 'social.create.failed'],
  ] as const)('un refus du serveur (%s) s\'affiche sous le champ, sans partage', async (kind, key) => {
    const { el, submit } = render();
    api.createOutcome = { kind };

    await submit('Potes');

    expect(error(el)).toBe(key);
    expect(shared).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sans compte : pas de formulaire, l\'invitation à en créer un', () => {
    const { el } = render('guest');

    expect(el.querySelector('[data-testid="new-group"]')).toBeNull();
    expect(el.querySelector('[data-testid="new-group-guest"] a')?.getAttribute('href')).toBe('/account/login');
  });
});
