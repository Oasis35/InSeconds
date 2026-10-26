import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionPlayer, SessionStore } from '../../../core/session/session.store';
import { RunsApi } from '../../data-access/runs.api';
import { FakeRunsApi, ME } from '../../data-access/testing/fake-runs-api';
import { RunsHomeEntryComponent } from './runs-home-entry.component';

describe('RunsHomeEntryComponent', () => {
  let api: FakeRunsApi;

  const player = (isGuest: boolean): SessionPlayer => ({ id: 'p1', pseudo: 'Clem', email: isGuest ? null : 'c@x.fr', isGuest, isAdmin: false });

  async function render(signedIn: SessionPlayer | null) {
    api = new FakeRunsApi();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    // L'adaptateur fourni par le composant (avec le client de l'API) est remplacé par le faux.
    TestBed.overrideComponent(RunsHomeEntryComponent, { set: { providers: [{ provide: RunsApi, useValue: api }] } });
    if (signedIn) TestBed.inject(SessionStore).signedIn(signedIn);
    const fixture = TestBed.createComponent(RunsHomeEntryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('un compte qui a l\'accès voit la carte', async () => {
    const { element } = await render(player(false));

    expect(api.calls).toEqual(['me']);
    expect(element.querySelector('[data-testid="run-home-card"]')).not.toBeNull();
  });

  it('sans accès, rien', async () => {
    api = new FakeRunsApi();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    api.meResult = ME({ hasAccess: false });
    TestBed.overrideComponent(RunsHomeEntryComponent, { set: { providers: [{ provide: RunsApi, useValue: api }] } });
    TestBed.inject(SessionStore).signedIn(player(false));
    const fixture = TestBed.createComponent(RunsHomeEntryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it('un invité ne demande même pas l\'accès', async () => {
    const { element } = await render(player(true));

    expect(api.calls).toEqual([]);
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it('un visiteur sans identité non plus', async () => {
    const { element } = await render(null);

    expect(api.calls).toEqual([]);
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it('une erreur de lecture de l\'accès n\'affiche rien', async () => {
    api = new FakeRunsApi();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    api.meResult = new Error('réseau');
    TestBed.overrideComponent(RunsHomeEntryComponent, { set: { providers: [{ provide: RunsApi, useValue: api }] } });
    TestBed.inject(SessionStore).signedIn(player(false));
    const fixture = TestBed.createComponent(RunsHomeEntryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="run-home-card"]')).toBeNull();
  });
});
