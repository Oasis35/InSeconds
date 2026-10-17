import { RESEND_DELAY_MS, resendSecondsLeft } from './resend';

describe('resend', () => {
  it('attend la minute du back après l\'envoi', () => {
    expect(resendSecondsLeft(1_000, 1_000)).toBe(60);
    expect(resendSecondsLeft(1_000, 1_500)).toBe(60);
    expect(resendSecondsLeft(1_000, 1_000 + RESEND_DELAY_MS - 1)).toBe(1);
  });

  it('permet de renvoyer une fois la minute passée', () => {
    expect(resendSecondsLeft(1_000, 1_000 + RESEND_DELAY_MS)).toBe(0);
    expect(resendSecondsLeft(1_000, 1_000 + 5 * RESEND_DELAY_MS)).toBe(0);
  });

  it('ne dépasse jamais le délai, même avec une horloge en retard sur l\'envoi', () => {
    expect(resendSecondsLeft(2_000, 1_000)).toBe(60);
  });

  it('rien à attendre sans envoi', () => {
    expect(resendSecondsLeft(null, 1_000)).toBe(0);
  });
});
