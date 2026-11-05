import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { SHARE_LINK, ShareOutcome, ShareService } from '../../core/share/share.service';
import { DailyApi } from './daily.api';
import { DailyShare, LONG_SHARE_LINK } from './daily-share';

describe('DailyShare', () => {
  let share: ReturnType<typeof vi.fn>;
  let recordShare: ReturnType<typeof vi.fn>;
  let dailyShare: DailyShare;

  beforeEach(() => {
    vi.useFakeTimers();
    share = vi.fn().mockResolvedValue('shared');
    recordShare = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        DailyShare, provideTranslateService(), { provide: ShareService, useValue: { share } }, { provide: DailyApi, useValue: { recordShare } },
      ],
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
    { artistCorrect: true, titleCorrect: true, listenedSeconds: 1 },
  ];
  const format = (s: number, lang: string) => `${s} s (${lang})`;
  const sharedLines = () => (share.mock.calls[0][0] as string).split('\n');

  it('court : le score avec le nom et le jour de jeu, la ligne ✅/🔶/🅾️, puis le lien marqué utm_source=share', async () => {
    // 23 h 30 UTC le 5 : déjà le 6 à Paris, mais le défi est celui du 5.
    vi.setSystemTime(new Date('2026-11-05T23:30:00Z'));
    await dailyShare.share(tracks, 1850, 'short', format);
    expect(sharedLines()).toEqual([expect.stringMatching(/^1\s850 pts · InSeconds 05\/11$/), '🔶🅾️✅', SHARE_LINK]);
  });

  it('détaillé : la même première ligne, une ligne par morceau dans la langue, puis le lien marqué utm_source=share-long', async () => {
    vi.setSystemTime(new Date('2026-11-05T23:30:00Z'));
    await dailyShare.share(tracks, 1850, 'long', format);
    expect(sharedLines()).toEqual([
      expect.stringMatching(/^1\s850 pts · InSeconds 05\/11$/), '✅❌ 0.5 s (fr)', '❌❌ 10 s (fr)', '✅✅ 1 s (fr)', LONG_SHARE_LINK,
    ]);
    expect(LONG_SHARE_LINK).toMatch(/\/\?utm_source=share-long$/);
  });

  it.each<[ShareOutcome, 'short' | 'long']>([['shared', 'short'], ['copied', 'long']])(
    'partage fait (%s) : compté pour l admin dans son format (%s)', async (outcome, shareFormat) => {
      share.mockResolvedValue(outcome);
      await dailyShare.share(tracks, 0, shareFormat, format);
      expect(recordShare).toHaveBeenCalledExactlyOnceWith(shareFormat);
    });

  it.each<ShareOutcome>(['cancelled', 'failed'])('menu fermé ou échec (%s) : rien n est compté', async outcome => {
    share.mockResolvedValue(outcome);
    await dailyShare.share(tracks, 0, 'short', format);
    expect(recordShare).not.toHaveBeenCalled();
  });

  it('un échec du compteur ne change rien pour le joueur', async () => {
    share.mockResolvedValue('copied');
    recordShare.mockRejectedValue(new Error('réseau'));
    await dailyShare.share(tracks, 0, 'short', format);
    await vi.runAllTicks();
    expect(dailyShare.copied()).toBe(true);
    expect(dailyShare.failed()).toBe(false);
  });

  it.each<ShareOutcome>(['shared', 'cancelled'])('partage natif ou menu fermé (%s) : le bouton ne change pas', async outcome => {
    share.mockResolvedValue(outcome);
    await dailyShare.share(tracks, 0, 'short', format);
    expect(dailyShare.copied()).toBe(false);
    expect(dailyShare.failed()).toBe(false);
  });

  it('copié : « Copié ! » pendant 2 s', async () => {
    share.mockResolvedValue('copied');
    await dailyShare.share(tracks, 0, 'short', format);
    expect(dailyShare.copied()).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(dailyShare.copied()).toBe(false);
  });

  it("échec : le message d'erreur pendant 3 s", async () => {
    share.mockResolvedValue('failed');
    await dailyShare.share(tracks, 0, 'short', format);
    expect(dailyShare.failed()).toBe(true);
    expect(dailyShare.copied()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(dailyShare.failed()).toBe(false);
  });
});
