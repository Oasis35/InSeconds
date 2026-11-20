import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { AnnounceVariant } from '../../domain/groups-announce';
import { GroupsAnnounceCardComponent } from './groups-announce-card.component';

describe('GroupsAnnounceCardComponent', () => {
  function render(variant: AnnounceVariant) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(GroupsAnnounceCardComponent);
    fixture.componentRef.setInput('variant', variant);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }
  const action = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-testid="groups-announce-action"]');

  it('un invité : « Créer un compte » en contour neutre', () => {
    const { element } = render('guest');

    expect(action(element)?.getAttribute('href')).toBe('/account/login');
    expect(action(element)?.classList).toContain('app-button--neutral');
  });

  it('un compte sans groupe : « Créer un groupe » en contour ambre', () => {
    const { element } = render('no_group');

    expect(action(element)?.getAttribute('href')).toBe('/ranking/new');
    expect(action(element)?.classList).toContain('app-button--accent');
  });

  it("un membre : la même phrase et « Créer un groupe », sans invitation dans un groupe précis", () => {
    const { element } = render('member');

    expect(action(element)?.getAttribute('href')).toBe('/ranking/new');
    expect(action(element)?.classList).toContain('app-button--accent');
    expect(element.textContent).toContain('social.announce.noGroup');
    expect(element.textContent).not.toContain('social.announce.member');
  });

  it('au maximum de groupes : la phrase seule, sans bouton', () => {
    const { fixture, element } = render('member');
    fixture.componentRef.setInput('canCreate', false);
    fixture.detectChanges();

    expect(action(element)).toBeNull();
    expect(element.textContent).toContain('social.announce.noGroup');
  });

  it('la croix ferme', () => {
    const { fixture, element } = render('no_group');
    let dismissed = 0;
    fixture.componentInstance.dismiss.subscribe(() => dismissed++);

    element.querySelector<HTMLElement>('[data-testid="groups-announce-close"]')?.click();

    expect(dismissed).toBe(1);
  });
});
