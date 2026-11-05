import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { SHARE_LINK, ShareOutcome, ShareService } from '../../core/share/share.service';
import { DailyShare } from './daily-share';

describe('DailyShare', () => {
  let share: ReturnType<typeof vi.fn>;
  let dailyShare: DailyShare;

  beforeEach(() => {
    vi.useFakeTimers();
    share = vi.fn().mockResolvedValue('shared');
    TestBed.configureTestingModule({
      providers: [DailyShare, provideTranslateService(), { provide: ShareService, useValue: { share } }],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { daily: { share: { header: '{{ score }} pts · InSeconds {{ date }}' } } });
    translate.use('fr');
    dailyShare = TestBed.inject(DailyShare);
  });

  afterEach(() => vi.useRealTimers());

  const tracks = [
    { artistCorrect: true, titleCorrect: false, listenedSeconds: 0.5 },
    { artistCorrect: false, titleCorrect: false, listenedSeconds: 10 },
  ];

  it('partage le score avec le nom et le jour de jeu, une ligne par morceau dans la langue, puis le lien marqué utm_source=share', async () => {
    // 23 h 30 UTC le 5 : déjà le 6 à Paris, mais le défi est celui du 5.
    vi.setSystemTime(new Date('2026-11-05T23:30:00Z'));
    await dailyShare.share(tracks, 1850, (s, lang) => `${s} s (${lang})`);
    const lines = (share.mock.calls[0][0] as string).split('\n');
    expect(lines[0]).toMatch(/^1\s850 pts · InSeconds 05\/11$/);
    expect(lines.slice(1, 3)).toEqual(['✅❌ 0.5 s (fr)', '❌❌ 10 s (fr)']);
    expect(lines[3]).toBe(SHARE_LINK);
    expect(lines).toHaveLength(4);
  });

  it.each<ShareOutcome>(['shared', 'cancelled'])('partage natif ou menu fermé (%s) : le bouton ne change pas', async outcome => {
    share.mockResolvedValue(outcome);
    await dailyShare.share(tracks, 0, String);
    expect(dailyShare.copied()).toBe(false);
    expect(dailyShare.failed()).toBe(false);
  });

  it('copié : « Copié ! » pendant 2 s', async () => {
    share.mockResolvedValue('copied');
    await dailyShare.share(tracks, 0, String);
    expect(dailyShare.copied()).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(dailyShare.copied()).toBe(false);
  });

  it("échec : le message d'erreur pendant 3 s", async () => {
    share.mockResolvedValue('failed');
    await dailyShare.share(tracks, 0, String);
    expect(dailyShare.failed()).toBe(true);
    expect(dailyShare.copied()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(dailyShare.failed()).toBe(false);
  });
});
