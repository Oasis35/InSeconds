import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { ShareOutcome, ShareService } from '../../core/share/share.service';
import { RunShare, playlistUrl, runShareText } from './run-share';
import { RunFinish } from '../domain/run';
import { TRACK } from './testing/fake-runs-api';

describe('runShareText', () => {
  const finish: RunFinish = {
    status: 'lost', disc: { key: 'runs.discs.wax', stars: 0 }, totalScore: 2410, roundsPassed: 1, foundCount: 4, trackCount: 20,
    tracks: [
      TRACK({ position: 1 }), TRACK({ position: 2, titleCorrect: false }), TRACK({ position: 3, artistCorrect: false, titleCorrect: false }),
      TRACK({ position: 4, neutralized: true }), TRACK({ position: 5 }),
      TRACK({ position: 7, round: 2 }), TRACK({ position: 6, round: 2, artistCorrect: false }),
    ],
    rounds: [
      { round: 1, score: 400, objective: 200, passed: true, difficulty: 'safe' },
      { round: 2, score: 150, objective: 333, passed: false, difficulty: 'risky' },
      { round: 3, score: null, objective: null, passed: false, difficulty: null },
    ],
    record: null, challengeCode: 'K7Q2M9', shortfall: { points: 183, disc: { key: 'runs.discs.bronze', stars: 0 } },
  };
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key);

  it('au-delà de l\'échelle, le disque garde ses étoiles', () => {
    const header = runShareText({ ...finish, disc: { key: 'runs.discs.gold', stars: 2 } }, 'fr', t).split('\n')[0];

    expect(header).toContain('"disc":"runs.discs.gold ★2"');
  });

  it('le score et le disque d\'abord, une ligne par manche jouée (un carré par morceau, dans l\'ordre), puis « Bats-moi » et le lien', () => {
    const lines = runShareText(finish, 'fr', t).split('\n');

    expect(lines[0]).toBe('runs.share.header{"score":"2\u202f410","disc":"runs.discs.wax"}');
    expect(lines[1]).toBe('🟩🟨🟥⬜🟩 runs.share.round{"round":1} · runs.difficulty.safe');
    expect(lines[2]).toBe('🟨🟩 runs.share.round{"round":2} · runs.difficulty.risky');
    expect(lines.slice(3)).toEqual(['runs.share.beatMe', playlistUrl('K7Q2M9')]);
  });

  it('rien qui identifie un morceau : ni artiste ni titre', () => {
    const text = runShareText(finish, 'fr', t);

    expect(text).not.toContain('Daft Punk');
    expect(text).not.toContain('One More Time');
  });
});

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

  it('le score d\'une partie finie : la grille, envoyée telle que runShareText l\'écrit, et le bouton qui dit « copié »', async () => {
    outcome = 'copied';
    const share = create();
    const finish: RunFinish = {
      status: 'won', disc: { key: 'runs.discs.gold', stars: 0 }, totalScore: 3000, roundsPassed: 4, foundCount: 1, trackCount: 20,
      tracks: [TRACK()], rounds: [{ round: 1, score: 100, objective: 50, passed: true, difficulty: 'safe' }], record: null,
      challengeCode: 'K7Q2M9', shortfall: null,
    };

    await share.shareScore(finish, 'fr');

    const translate = TestBed.inject(TranslateService);
    expect(shared).toEqual([runShareText(finish, 'fr', (key, params) => translate.instant(key, params))]);
    expect(shared[0]).toContain('🟩');
    expect(shared[0]).toContain(playlistUrl('K7Q2M9'));
    expect(share.copied()).toBe(true);
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
