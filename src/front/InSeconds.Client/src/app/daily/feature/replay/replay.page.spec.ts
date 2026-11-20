import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { providePlayersApiFake, fakePlayersApi } from '../../../account/data-access/testing/fake-players-api';
import { settle } from '../../../account/feature/testing/dom';
import { PREVIEW_AUDIO_FACTORY, PreviewAudio } from '../../../core/audio-preview/audio-preview.player';
import { FakeDailyApi, REPLAY_PAGE, provideFakeDailyApi } from '../../data-access/testing/fake-daily-api';
import { ReplayPage } from './replay.page';

class SilentAudio implements PreviewAudio {
  paused = true;
  currentTime = 0;
  duration = 30;
  onended: ((event: Event) => unknown) | null = null;
  constructor(readonly url: string) {}
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

describe('ReplayPage', () => {
  async function render(fake = new FakeDailyApi()) {
    const created: SilentAudio[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]), providePlayersApiFake(fakePlayersApi()), provideFakeDailyApi(fake),
        { provide: PREVIEW_AUDIO_FACTORY, useValue: (url: string) => { const audio = new SilentAudio(url); created.push(audio); return audio; } },
      ],
    });
    const fixture = TestBed.createComponent(ReplayPage);
    await settle(fixture);
    return { fixture, fake, created, el: fixture.nativeElement as HTMLElement };
  }

  it('montre les morceaux ratés par jour et les compteurs des filtres', async () => {
    const { el, fake } = await render();

    expect(fake.calls).toContain('replay all ');
    expect(el.querySelectorAll('[data-testid="replay-day"]')).toHaveLength(1);
    expect(el.querySelectorAll('[data-testid="replay-track"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="replay-filter-all"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-testid="replay-more"]')).toBeNull();
  });

  it('un filtre relit la première page', async () => {
    const { fixture, el, fake } = await render();

    el.querySelector<HTMLButtonElement>('[data-testid="replay-filter-none"]')!.click();
    await settle(fixture);

    expect(fake.calls).toContain('replay none ');
    expect(el.querySelector('[data-testid="replay-filter-none"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it("« Voir plus » ajoute la page suivante", async () => {
    const fake = new FakeDailyApi();
    fake.replayPages = { '': REPLAY_PAGE({ nextBefore: '2026-11-19' }), '2026-11-19': REPLAY_PAGE({ days: [{ date: '2026-11-15', tracks: REPLAY_PAGE().days[0].tracks }] }) };
    const { fixture, el } = await render(fake);

    el.querySelector<HTMLButtonElement>('[data-testid="replay-more"]')!.click();
    await settle(fixture);

    expect(el.querySelectorAll('[data-testid="replay-day"]')).toHaveLength(2);
  });

  it("l'écoute demande une adresse neuve et montre le lecteur ; un second toucher met en pause", async () => {
    const { fixture, el, fake, created } = await render();

    el.querySelector<HTMLButtonElement>('[data-testid="replay-listen"]')!.click();
    await settle(fixture);

    expect(fake.calls).toContain('archivePreview 2026-11-19 2');
    expect(created).toHaveLength(1);
    expect(el.querySelector('[data-testid="replay-player"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="replay-listen"]')?.getAttribute('aria-label')).toBe('daily.archive.pause');

    el.querySelector<HTMLButtonElement>('[data-testid="replay-listen"]')!.click();
    await settle(fixture);
    expect(created[0].paused).toBe(true);
  });

  it('rien à réécouter : un message', async () => {
    const fake = new FakeDailyApi();
    fake.replayPages = { '': REPLAY_PAGE({ days: [], allCount: 0, noneCount: 0, halfCount: 0 }) };
    const { el } = await render(fake);

    expect(el.querySelector('[data-testid="replay-empty"]')).not.toBeNull();
  });
});
