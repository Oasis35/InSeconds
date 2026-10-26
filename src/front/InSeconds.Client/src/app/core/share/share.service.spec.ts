import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ClipboardService } from '../clipboard/clipboard.service';
import { ErrorReportingService } from '../errors/error-reporting.service';
import { SHARE_LINK, ShareService } from './share.service';

describe('ShareService', () => {
  let copy: Mock;
  let report: Mock;
  let service: ShareService;
  const realShare = Object.getOwnPropertyDescriptor(navigator, 'share');

  beforeEach(() => {
    copy = vi.fn().mockResolvedValue(true);
    report = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ShareService,
        { provide: ClipboardService, useValue: { copy } },
        { provide: ErrorReportingService, useValue: { report } },
      ],
    });
    service = TestBed.inject(ShareService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (realShare) Object.defineProperty(navigator, 'share', realShare);
    else delete (navigator as { share?: unknown }).share;
  });

  const setShare = (share: ((data: ShareData) => Promise<void>) | undefined) =>
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  const setTouch = (coarse: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: coarse && query === '(pointer: coarse)' }) as MediaQueryList);

  it("ouvre le menu du téléphone sur écran tactile, sans rien copier", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    setTouch(true);
    expect(await service.share('texte')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'texte' });
    expect(copy).not.toHaveBeenCalled();
  });

  it('menu fermé par le joueur : ni copie, ni remontée', async () => {
    setShare(() => Promise.reject(new DOMException('annulé', 'AbortError')));
    setTouch(true);
    expect(await service.share('texte')).toBe('cancelled');
    expect(copy).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("menu en échec : copie à la place, remonte le type d'erreur sans le texte", async () => {
    setShare(() => Promise.reject(new DOMException('refusé', 'NotAllowedError')));
    setTouch(true);
    expect(await service.share('texte secret')).toBe('copied');
    expect(copy).toHaveBeenCalledWith('texte secret');
    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0].message).toContain('NotAllowedError');
    expect(report.mock.calls[0][0].message).not.toContain('texte secret');
  });

  it("menu en échec puis copie refusée : échec", async () => {
    setShare(() => Promise.reject(new DOMException('refusé', 'NotAllowedError')));
    setTouch(true);
    copy.mockResolvedValue(false);
    expect(await service.share('texte')).toBe('failed');
  });

  it("sur ordinateur, copie même si le navigateur a un menu de partage", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    setTouch(false);
    expect(await service.share('texte')).toBe('copied');
    expect(share).not.toHaveBeenCalled();
  });

  it('sans menu de partage, copie', async () => {
    setShare(undefined);
    setTouch(true);
    expect(await service.share('texte')).toBe('copied');
  });

  it("le lien partagé est l'adresse du site marquée utm_source=share", () => {
    expect(SHARE_LINK).toMatch(/^https?:\/\/[^/]+\/\?utm_source=share$/);
  });
});
