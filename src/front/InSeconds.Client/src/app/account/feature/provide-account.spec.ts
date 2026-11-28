import { DOCUMENT } from '@angular/common';
import { ApplicationInitStatus, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ARRIVAL_SOURCE_KEY } from '../data-access/arrival-source.service';
import { SessionLoader } from '../data-access/session-loader';
import { provideAccount } from './provide-account';

describe('provideAccount', () => {
  afterEach(() => sessionStorage.removeItem(ARRIVAL_SOURCE_KEY));

  async function start(platform: 'browser' | 'server', href: string): Promise<ReturnType<typeof vi.fn>> {
    const ensureLoaded = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        provideAccount(),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: DOCUMENT, useValue: { location: { href }, referrer: '' } },
        { provide: SessionLoader, useValue: { ensureLoaded } },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    return ensureLoaded;
  }

  it('au démarrage du navigateur, note la source d\'arrivée du lien puis lance la lecture de l\'identité', async () => {
    const ensureLoaded = await start('browser', 'https://inseconds.cc/?utm_source=instagram');

    expect(sessionStorage.getItem(ARRIVAL_SOURCE_KEY)).toBe('instagram');
    expect(ensureLoaded).toHaveBeenCalledOnce();
  });

  it('au prérendu, ni source ni lecture : il n\'y a ni onglet ni API', async () => {
    const ensureLoaded = await start('server', 'https://inseconds.cc/?utm_source=instagram');

    expect(sessionStorage.getItem(ARRIVAL_SOURCE_KEY)).toBeNull();
    expect(ensureLoaded).not.toHaveBeenCalled();
  });
});
