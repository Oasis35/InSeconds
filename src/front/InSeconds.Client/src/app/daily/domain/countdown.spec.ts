import { formatCountdown, secondsUntilMidnightUtc, timeLeft } from './countdown';

describe('countdown', () => {
  it("compte jusqu'à minuit UTC", () => {
    expect(secondsUntilMidnightUtc(new Date('2026-10-08T23:59:30Z'))).toBe(30);
    expect(secondsUntilMidnightUtc(new Date('2026-10-08T00:00:00Z'))).toBe(86_400);
  });

  it('passe au mois suivant', () => {
    expect(secondsUntilMidnightUtc(new Date('2026-10-31T23:00:00Z'))).toBe(3600);
  });

  it("s'écrit hh:mm:ss", () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(3661)).toBe('01:01:01');
    expect(formatCountdown(86_399)).toBe('23:59:59');
  });

  it('le temps qui reste se dit en heures entières, en minutes sous une heure', () => {
    expect(timeLeft(6 * 3600 + 700)).toEqual({ unit: 'hours', value: 6 });
    expect(timeLeft(3600)).toEqual({ unit: 'hours', value: 1 });
    expect(timeLeft(3599)).toEqual({ unit: 'minutes', value: 60 });
    expect(timeLeft(125)).toEqual({ unit: 'minutes', value: 3 });
    expect(timeLeft(0)).toEqual({ unit: 'minutes', value: 1 });
  });
});
