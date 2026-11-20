import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { providePlayersApiFake, fakePlayersApi } from '../../../account/data-access/testing/fake-players-api';
import { settle } from '../../../account/feature/testing/dom';
import { PREVIEW_AUDIO_FACTORY, PreviewAudio } from '../../../core/audio-preview/audio-preview.player';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { ARCHIVE_ME, FakeDailyApi, provideFakeDailyApi } from '../../data-access/testing/fake-daily-api';
import { ArchivePage } from './archive.page';

class SilentAudio implements PreviewAudio {
  paused = true;
  currentTime = 0;
  duration = 30;
  onended: ((event: Event) => unknown) | null = null;
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

describe('ArchivePage', () => {
  async function render(fake = new FakeDailyApi(), dailyDone: boolean | null = true) {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), providePlayersApiFake(fakePlayersApi()), provideFakeDailyApi(fake),
        provideRouter([{ path: 'history/daily/:date', component: ArchivePage }, { path: '**', children: [] }]),
        { provide: PREVIEW_AUDIO_FACTORY, useValue: () => new SilentAudio() },
      ],
    });
    TestBed.inject(ShellChromeStore).setDailyDone(dailyDone);
    const harness = await RouterTestingHarness.create('/history/daily/2026-10-21');
    await settle(harness.fixture);
    return { fixture: harness.fixture, fake, el: harness.routeNativeElement as HTMLElement };
  }

  it("un jour pas joué : les réponses d'office, et le retour mène au mois du jour", async () => {
    const { el } = await render();

    expect(el.querySelector('[data-testid="archive-back"]')?.getAttribute('href')).toBe('/history/daily?mois=2026-10');
    expect(el.querySelector('[data-testid="archive-not-played"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="archive-track"]').length).toBeGreaterThan(0);
    expect(el.querySelector('[data-testid="archive-artist"]')?.textContent).toContain('Artiste');
  });

  it('un jour joué : son score', async () => {
    const fake = new FakeDailyApi();
    fake.archiveMe = ARCHIVE_ME();
    const { el } = await render(fake);

    expect(el.querySelector('[data-testid="archive-my-score"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="archive-not-played"]')).toBeNull();
  });

  it("« Jouer le défi du jour » seulement s'il reste à jouer", async () => {
    expect((await render(new FakeDailyApi(), true)).el.querySelector('[data-testid="archive-play-today"]')).toBeNull();
    TestBed.resetTestingModule();
    expect((await render(new FakeDailyApi(), false)).el.querySelector('[data-testid="archive-play-today"]')).not.toBeNull();
  });

  it("l'écoute d'un morceau demande une adresse neuve", async () => {
    const { fixture, el, fake } = await render();

    el.querySelector<HTMLButtonElement>('[data-testid="archive-track-toggle"]')!.click();
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="archive-listen"]')!.click();
    await settle(fixture);

    expect(fake.calls).toContain('archivePreview 2026-10-21 1');
    expect(el.querySelector('[data-testid="archive-listen"]')?.getAttribute('aria-label')).toBe('daily.archive.pause');
  });
});
