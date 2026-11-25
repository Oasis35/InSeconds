/** Ce que le navigateur dit de lui, juste ce qu'il faut pour décider comment proposer l'installation. */
export interface InstallEnvironment {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
}

/** Les navigateurs tiers d'iOS (Chrome, Firefox, Edge, Opera, Google) : sur iPhone ils ne proposent pas « Sur l'écran d'accueil » comme Safari. */
const IOS_THIRD_PARTY = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA|DuckDuckGo|YaBrowser/i;

/**
 * Safari sur iPhone ou iPad : le seul cas où l'installation se fait à la main (Partager, puis « Sur l'écran d'accueil »). Un iPad récent se présente comme un Mac :
 * on le reconnaît à son écran tactile.
 */
export function isIosSafari(env: InstallEnvironment): boolean {
  const ios = /iPhone|iPad|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
  return ios && /Safari/.test(env.userAgent) && !IOS_THIRD_PARTY.test(env.userAgent);
}

/** Comment proposer l'installation : par le navigateur (`native`), par les étapes de Safari (`ios`), ou pas du tout (`null`). */
export type InstallMode = 'native' | 'ios';

export interface InstallContext {
  readonly environment: InstallEnvironment;
  /** L'appli tourne déjà depuis l'écran d'accueil (`display-mode: standalone`, `navigator.standalone` sur iOS). */
  readonly standalone: boolean;
  /** Écran tactile (pointeur grossier) : téléphone ou tablette. Jamais de proposition sur ordinateur. */
  readonly touch: boolean;
  /** Le navigateur a signalé qu'il sait installer (`beforeinstallprompt`) et l'événement est gardé. */
  readonly nativePromptReady: boolean;
}

export function installMode(context: InstallContext): InstallMode | null {
  if (context.standalone || !context.touch) return null;
  if (context.nativePromptReady) return 'native';
  return isIosSafari(context.environment) ? 'ios' : null;
}
