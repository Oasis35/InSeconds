/**
 * Un son de test : une note de `seconds` secondes (WAV mono 8 kHz), servie par une adresse `blob:`
 * que Howler télécharge et décode comme un vrai extrait. Aucun fichier à servir ni réseau.
 */
export function makeToneUrl(seconds: number): string {
  const sampleRate = 8000;
  const samples = Math.round(seconds * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.codePointAt(0)!));

  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}
