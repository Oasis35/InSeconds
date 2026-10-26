import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { SHARE_LINK, ShareService } from '../../core/share/share.service';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { FakeDailyApi, provideFakeDailyApi } from './testing/fake-daily-api';
import { THANKS_NOTICE_ID, THANKS_SEEN_KEY, ThanksNotice } from './thanks-notice';

describe('ThanksNotice', () => {
  let storage: MemoryStoragePort;
  let api: FakeDailyApi;
  let share: ReturnType<typeof vi.fn>;
  let notice: ThanksNotice;

  beforeEach(() => {
    storage = new MemoryStoragePort();
    api = new FakeDailyApi();
    share = vi.fn().mockResolvedValue('shared');
    TestBed.configureTestingModule({
      providers: [
        ThanksNotice, provideTranslateService(), provideFakeDailyApi(api),
        { provide: StoragePort, useValue: storage },
        { provide: ShareService, useValue: { share } },
      ],
    });
    notice = TestBed.inject(ThanksNotice);
  });

  it("à montrer tant qu'il n'a pas été vu, plus jamais ensuite", () => {
    expect(notice.isDue()).toBe(true);
    notice.markSeen();
    expect(storage.get(THANKS_SEEN_KEY)).toBe(THANKS_NOTICE_ID);
    expect(notice.isDue()).toBe(false);
  });

  it("un autre message vu avant (autre valeur) n'empêche pas celui-ci", () => {
    storage.set(THANKS_SEEN_KEY, 'autre-message');
    expect(notice.isDue()).toBe(true);
  });

  it('rend le nombre de parties arrondi, `null` si l\'API échoue', async () => {
    expect(await notice.gamesPlayed()).toBe(2550);
    api.gamesPlayed = new Error('panne');
    expect(await notice.gamesPlayed()).toBeNull();
  });

  it("« Défie un ami » partage l'invitation avec le lien marqué utm_source=share, et rend l'issue du partage", async () => {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { daily: { thanks: { challengeText: 'Viens jouer {{ url }}' } } });
    translate.use('fr');
    expect(await notice.challengeFriend()).toBe('shared');
    expect(share).toHaveBeenCalledWith(`Viens jouer ${SHARE_LINK}`);
    share.mockResolvedValue('failed');
    expect(await notice.challengeFriend()).toBe('failed');
  });
});
