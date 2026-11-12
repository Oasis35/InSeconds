import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionPlayer, SessionStore } from '../../../core/session/session.store';
import { SETLIST_ACCESS_LOADER } from '../../data-access/setlist-access.store';
import { RunsHomeEntryComponent } from './runs-home-entry.component';

describe('RunsHomeEntryComponent', () => {
  const player = (isGuest: boolean): SessionPlayer => ({ id: 'p1', pseudo: 'Clem', email: isGuest ? null : 'c@x.fr', isGuest, isAdmin: false });

  async function render(signedIn: SessionPlayer | null, load: () => Promise<boolean>) {
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), provideRouter([]), { provide: SETLIST_ACCESS_LOADER, useValue: load }],
    });
    const session = TestBed.inject(SessionStore);
    if (signedIn) session.signedIn(signedIn);
    session.markLoaded();
    const fixture = TestBed.createComponent(RunsHomeEntryComponent);
    fixture.detectChanges();
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement);
  }

  it("un compte qui a l'accès voit la carte", async () => {
    const element = await render(player(false), async () => true);
    expect(element.querySelector('[data-testid="run-home-card"]')).not.toBeNull();
  });

  it('sans accès, rien', async () => {
    const element = await render(player(false), async () => false);
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it("une erreur vaut « pas d'accès »", async () => {
    const element = await render(player(false), () => Promise.reject(new Error('réseau')));
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it("un invité ne demande rien et ne voit rien", async () => {
    const load = vi.fn(async () => true);
    const element = await render(player(true), load);
    expect(load).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });
});
