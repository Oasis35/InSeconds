import { TestBed } from '@angular/core/testing';
import { DEFAULT_TOAST_DURATION_MS, MAX_VISIBLE_TOASTS, ToastService } from './toast.service';

describe('ToastService', () => {
  let toasts: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('affiche un toast puis le retire après sa durée', () => {
    toasts.show('common.retry', { tone: 'success' });
    expect(toasts.toasts()).toEqual([expect.objectContaining({ messageKey: 'common.retry', tone: 'success' })]);

    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS);

    expect(toasts.toasts()).toEqual([]);
  });

  it('garde un toast sans durée jusqu\'à sa fermeture', () => {
    const id = toasts.show('common.retry', { durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(toasts.toasts()).toHaveLength(1);

    toasts.dismiss(id);

    expect(toasts.toasts()).toEqual([]);
  });

  it(`n'en montre jamais plus de ${MAX_VISIBLE_TOASTS} : le plus ancien disparaît`, () => {
    for (let i = 1; i <= MAX_VISIBLE_TOASTS + 1; i++) toasts.show(`message.${i}`);

    expect(toasts.toasts().map(t => t.messageKey)).toEqual(['message.2', 'message.3', 'message.4']);
  });

  it('prend « info » par défaut', () => {
    toasts.show('common.retry');

    expect(toasts.toasts()[0].tone).toBe('info');
  });
});
