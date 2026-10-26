import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { ShareOutcome, ShareService } from '../../core/share/share.service';
import { RunShare, playlistUrl } from './run-share';

describe('RunShare', () => {
  let shared: string[];
  let outcome: ShareOutcome;

  function create(): RunShare {
    shared = [];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), RunShare,
        { provide: ShareService, useValue: { share: (text: string) => { shared.push(text); return Promise.resolve(outcome); } } },
      ],
    });
    TestBed.inject(TranslateService).setTranslation('fr', { runs: { share: { text: 'Une playlist !' } } });
    TestBed.inject(TranslateService).use('fr');
    return TestBed.inject(RunShare);
  }

  it("partage une phrase et l'adresse de la playlist", async () => {
    outcome = 'copied';
    const share = create();

    await share.share('K7Q2M9');

    expect(shared).toEqual([`Une playlist !\n${playlistUrl('K7Q2M9')}`]);
    expect(playlistUrl('K7Q2M9')).toMatch(/\/runs\/K7Q2M9\?utm_source=share$/);
  });

  it('copié ou échec : le bouton le dit quelques secondes', async () => {
    vi.useFakeTimers();
    outcome = 'copied';
    const share = create();
    await share.share('K7Q2M9');
    expect(share.copied()).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(share.copied()).toBe(false);
    outcome = 'failed';
    await share.share('K7Q2M9');
    expect(share.failed()).toBe(true);
    vi.useRealTimers();
  });

  it('un partage natif ou un menu fermé ne change rien au bouton', async () => {
    outcome = 'shared';
    const share = create();
    await share.share('K7Q2M9');
    outcome = 'cancelled';
    await share.share('K7Q2M9');

    expect(share.copied()).toBe(false);
    expect(share.failed()).toBe(false);
  });
});
