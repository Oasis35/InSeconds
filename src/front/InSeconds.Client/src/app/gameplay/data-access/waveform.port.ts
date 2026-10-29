import { Waveform } from '../domain/waveform';

/**
 * La forme d'un extrait (barres de la waveform, basses du bouton), calculée dans le navigateur : implémenté par `DecodedWaveform`.
 * Le son ne l'attend jamais : la manche la demande une fois la lecture partie, et le lecteur garde des barres plates tant qu'elle n'est
 * pas là, ou si elle échoue.
 */
export abstract class WaveformPort {
  /** La forme de l'extrait, barres de 0 à `seconds` ; `null` si elle n'a pas pu être calculée (jamais d'exception). */
  abstract load(url: string, seconds: number): Promise<Waveform | null>;
}
