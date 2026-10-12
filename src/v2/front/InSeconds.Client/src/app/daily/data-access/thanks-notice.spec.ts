import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { FakeDailyApi, provideFakeDailyApi } from './testing/fake-daily-api';
import { THANKS_NOTICE_ID, THANKS_SEEN_KEY, ThanksNotice } from './thanks-notice';

describe('ThanksNotice', () => {
  let storage: MemoryStoragePort;
  let api: FakeDailyApi;
  let copy: ReturnType<typeof vi.fn>;
  let notice: ThanksNotice;
  const realShare = Object.getOwnPropertyDescriptor(navigator, 'share');

  beforeEach(() => {
    storage = new MemoryStoragePort();
    api = new FakeDailyApi();
    copy = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        ThanksNotice, provideTranslateService(), provideFakeDailyApi(api),
        { provide: StoragePort, useValue: storage },
        { provide: ClipboardService, useValue: { copy } },
      ],
    });
    notice = TestBed.inject(ThanksNotice);
  });

  afterEach(() => {
    if (realShare) Object.defineProperty(navigator, 'share', realShare);
    else delete (navigator as { share?: unknown }).share;
  });

  const setShare = (share: ((data: ShareData) => Promise<void>) | undefined) =>
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

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

  it('partage par le menu du téléphone quand il existe', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    expect(await notice.challengeFriend()).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'daily.thanks.challengeText' });
    expect(copy).not.toHaveBeenCalled();
  });

  it('menu fermé par le joueur : rien de copié', async () => {
    setShare(() => Promise.reject(new DOMException('annulé', 'AbortError')));
    expect(await notice.challengeFriend()).toBe('cancelled');
    expect(copy).not.toHaveBeenCalled();
  });

  it('sans menu de partage, ou s\'il échoue, copie le texte', async () => {
    setShare(undefined);
    expect(await notice.challengeFriend()).toBe('copied');
    setShare(() => Promise.reject(new DOMException('refusé', 'NotAllowedError')));
    copy.mockResolvedValue(false);
    expect(await notice.challengeFriend()).toBe('failed');
    expect(copy).toHaveBeenCalledTimes(2);
  });
});
