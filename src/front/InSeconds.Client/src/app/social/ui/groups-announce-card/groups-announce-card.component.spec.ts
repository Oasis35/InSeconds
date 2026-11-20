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
    fixture.componentRef.setInput('groupName', 'Potes');
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

  it("un membre : le bouton demande le partage du lien, la croix ferme", () => {
    const { fixture, element } = render('member');
    let invited = 0;
    let dismissed = 0;
    fixture.componentInstance.invite.subscribe(() => invited++);
    fixture.componentInstance.dismiss.subscribe(() => dismissed++);

    action(element)?.click();
    element.querySelector<HTMLElement>('[data-testid="groups-announce-close"]')?.click();

    expect(invited).toBe(1);
    expect(dismissed).toBe(1);
  });
});
