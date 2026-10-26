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
    translate.setTranslation('fr', { daily: { share: { title: 'InSeconds · {{ date }}', score: '{{ score }} pts' } } });
    translate.use('fr');
    dailyShare = TestBed.inject(DailyShare);
  });

  afterEach(() => vi.useRealTimers());

  const tracks = [
    { artistCorrect: true, titleCorrect: false },
    { artistCorrect: false, titleCorrect: false },
  ];

  it('partage la date, la ligne de ✅/❌, le score et le lien marqué utm_source=share', async () => {
    await dailyShare.share(tracks, 1850);
    const lines = (share.mock.calls[0][0] as string).split('\n');
    expect(lines[0]).toMatch(/^InSeconds · \d{2}\/\d{2}$/);
    expect(lines[1]).toBe('✅❌');
    expect(lines[2]).toMatch(/^1\s850 pts$/);
    expect(lines[3]).toBe(SHARE_LINK);
  });

  it.each<ShareOutcome>(['shared', 'cancelled'])('partage natif ou menu fermé (%s) : le bouton ne change pas', async outcome => {
    share.mockResolvedValue(outcome);
    await dailyShare.share(tracks, 0);
    expect(dailyShare.copied()).toBe(false);
    expect(dailyShare.failed()).toBe(false);
  });

  it('copié : « Copié ! » pendant 2 s', async () => {
    share.mockResolvedValue('copied');
    await dailyShare.share(tracks, 0);
    expect(dailyShare.copied()).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(dailyShare.copied()).toBe(false);
  });

  it("échec : le message d'erreur pendant 3 s", async () => {
    share.mockResolvedValue('failed');
    await dailyShare.share(tracks, 0);
    expect(dailyShare.failed()).toBe(true);
    expect(dailyShare.copied()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(dailyShare.failed()).toBe(false);
  });
});
