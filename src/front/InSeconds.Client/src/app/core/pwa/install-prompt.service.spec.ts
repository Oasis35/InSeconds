import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { MemoryStoragePort, StoragePort } from '../storage/storage.port';
import { InstallPromptService } from './install-prompt.service';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

interface FakeView { listeners: Map<string, (event: Event) => void>; view: unknown }

function fakeView(options: { touch?: boolean; standalone?: boolean } = {}): FakeView {
  const listeners = new Map<string, (event: Event) => void>();
  const view = {
    addEventListener: (name: string, handler: (event: Event) => void) => listeners.set(name, handler),
    matchMedia: (query: string) => ({ matches: query.includes('pointer: coarse') ? (options.touch ?? true) : (options.standalone ?? false) }),
    navigator: { userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 },
  };
  return { listeners, view };
}

function setup(options: { touch?: boolean; standalone?: boolean } = {}, storage = new MemoryStoragePort()) {
  const fake = fakeView(options);
  TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: fake.view } }, { provide: StoragePort, useValue: storage }] });
  const service = TestBed.inject(InstallPromptService);
  service.init();
  return { service, fake, storage };
}

function promptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('InstallPromptService', () => {
  it("ne propose rien avant que le navigateur signale qu'il sait installer", () => {
    expect(setup().service.mode()).toBeNull();
  });

  it("garde l'événement du navigateur (sans laisser son invite) et propose l'installation native", () => {
    const { service, fake } = setup();
    const event = promptEvent('accepted');
    fake.listeners.get('beforeinstallprompt')?.(event);
    expect(event.defaultPrevented).toBe(true);
    expect(service.mode()).toBe('native');
  });

  it("rejoue l'invite au toucher et rend le choix du joueur ; l'événement ne sert qu'une fois", async () => {
    const { service, fake } = setup();
    const event = promptEvent('accepted');
    fake.listeners.get('beforeinstallprompt')?.(event);
    expect(await service.promptNative()).toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(await service.promptNative()).toBe(false);
    expect(service.mode()).toBeNull();
  });

  it('un refus du joueur est rendu tel quel', async () => {
    const { service, fake } = setup();
    fake.listeners.get('beforeinstallprompt')?.(promptEvent('dismissed'));
    expect(await service.promptNative()).toBe(false);
  });

  it("un navigateur qui refuse de rejouer l'invite ne casse rien : rendu `false`", async () => {
    const { service, fake } = setup();
    const event = promptEvent('accepted');
    event.prompt = vi.fn().mockRejectedValue(new DOMException('déjà utilisé', 'InvalidStateError'));
    fake.listeners.get('beforeinstallprompt')?.(event);
    expect(await service.promptNative()).toBe(false);
  });

  it("ne propose plus rien une fois l'appli installée", () => {
    const { service, fake } = setup();
    fake.listeners.get('beforeinstallprompt')?.(promptEvent('accepted'));
    fake.listeners.get('appinstalled')?.(new Event('appinstalled'));
    expect(service.mode()).toBeNull();
  });

  it('ne propose rien sur ordinateur ni depuis une appli déjà installée', () => {
    for (const options of [{ touch: false }, { standalone: true }]) {
      TestBed.resetTestingModule();
      const { service, fake } = setup(options);
      fake.listeners.get('beforeinstallprompt')?.(promptEvent('accepted'));
      expect(service.mode()).toBeNull();
    }
  });

  it('retient la fermeture de la ligne dans le navigateur, sans rien envoyer ailleurs', () => {
    const { service, storage } = setup();
    expect(service.lineDismissed()).toBe(false);
    service.dismissLine();
    expect(service.lineDismissed()).toBe(true);
    TestBed.resetTestingModule();
    const again = setup({}, storage);
    expect(again.service.lineDismissed()).toBe(true);
  });
});
