/** 10 ms de silence (WAV mono 8 kHz), joués dans le clic pour déverrouiller l'élément sur iPhone. */
const SILENCE_WAV_BASE64 =
  'UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

/** `play()` rejeté parce qu'interrompu par notre propre `pause()` ou un changement de source : pas une panne. */
export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * L'élément audio est **un seul pour toute la page** : sur iPhone, un élément ne joue hors d'un geste qu'après avoir joué une fois dans
 * un geste, et le clic qui lance une partie depuis l'accueil se fait dans une autre route (donc un autre lecteur) que la partie.
 *
 * Ce fichier n'a aucune dépendance : l'accueil l'importe sans embarquer le lecteur (`HtmlAudioPort`) ni le reste de la manche.
 */
let sharedAudio: HTMLAudioElement | null = null;
let sharedUnlocked = false;

export function audioElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null;
  if (sharedAudio === null) {
    sharedAudio = new Audio();
    // iPhone : lire dans la page, jamais en plein écran (absent du type `HTMLAudioElement`).
    sharedAudio.setAttribute('playsinline', '');
  }
  return sharedAudio;
}

/** L'élément partagé a-t-il déjà joué dans un geste du joueur ? */
export function isSharedAudioUnlocked(): boolean {
  return sharedUnlocked;
}

/** Posé par le lecteur quand il tente (ou rate) son propre déverrouillage. */
export function setSharedAudioUnlocked(unlocked: boolean): void {
  sharedUnlocked = unlocked;
}

/** Le silence du déverrouillage, en octets d'un WAV (la CSP refuse `data:` pour un son : l'appelant en fait une adresse `blob:`). */
export function silenceWavBytes(): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(SILENCE_WAV_BASE64), c => c.codePointAt(0)!);
}

/**
 * Déverrouille l'élément partagé depuis un clic, avant que le lecteur de la page suivante n'existe (la carte Survie ou la carte du défi de l'accueil).
 * Rien ne joue : un silence de 10 ms. Sans effet une fois l'élément déverrouillé ou si le navigateur refuse (le prochain clic réessaie).
 */
export function unlockSharedAudio(): void {
  const audio = audioElement();
  if (!audio || sharedUnlocked || !audio.paused) return;
  sharedUnlocked = true;
  const url = URL.createObjectURL(new Blob([silenceWavBytes()], { type: 'audio/wav' }));
  audio.src = url;
  audio.play().then(
    () => {
      audio.pause();
      URL.revokeObjectURL(url);
    },
    (err: unknown) => {
      if (!isAbort(err)) sharedUnlocked = false;
      URL.revokeObjectURL(url);
    },
  );
}

/** Pour les tests : l'élément repart de zéro. */
export function resetSharedAudioElement(): void {
  sharedAudio = null;
  sharedUnlocked = false;
}
