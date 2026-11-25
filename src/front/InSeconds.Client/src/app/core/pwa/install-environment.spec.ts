import { InstallContext, InstallEnvironment, installMode, isIosSafari } from './install-environment';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const env = (userAgent: string, platform = 'iPhone', maxTouchPoints = 5): InstallEnvironment => ({ userAgent, platform, maxTouchPoints });
const context = (over: Partial<InstallContext>): InstallContext => ({ environment: env(IPHONE_SAFARI), standalone: false, touch: true, nativePromptReady: false, ...over });

describe('isIosSafari', () => {
  it('reconnaît Safari sur iPhone', () => expect(isIosSafari(env(IPHONE_SAFARI))).toBe(true));
  it('reconnaît un iPad qui se présente comme un Mac, à son écran tactile', () => expect(isIosSafari(env(MAC_SAFARI, 'MacIntel', 5))).toBe(true));
  it('refuse un vrai Mac, sans écran tactile', () => expect(isIosSafari(env(MAC_SAFARI, 'MacIntel', 0))).toBe(false));
  it("refuse Chrome sur iPhone, qui n'a pas les mêmes étapes", () => expect(isIosSafari(env(IPHONE_CHROME))).toBe(false));
  it('refuse Android', () => expect(isIosSafari(env(ANDROID_CHROME, 'Linux armv8l'))).toBe(false));
});

describe('installMode', () => {
  it("propose l'invite du navigateur quand il l'a signalée", () => {
    expect(installMode(context({ environment: env(ANDROID_CHROME, 'Linux armv8l'), nativePromptReady: true }))).toBe('native');
  });
  it("propose les étapes de Safari sur iPhone, sans événement", () => expect(installMode(context({}))).toBe('ios'));
  it('ne propose rien sur ordinateur (pointeur fin), même si le navigateur sait installer', () => {
    expect(installMode(context({ touch: false, nativePromptReady: true }))).toBeNull();
  });
  it("ne propose rien quand l'appli est déjà lancée depuis l'écran d'accueil", () => {
    expect(installMode(context({ standalone: true }))).toBeNull();
    expect(installMode(context({ standalone: true, nativePromptReady: true }))).toBeNull();
  });
  it("ne propose rien sur Android tant que le navigateur n'a rien signalé", () => {
    expect(installMode(context({ environment: env(ANDROID_CHROME, 'Linux armv8l') }))).toBeNull();
  });
});
