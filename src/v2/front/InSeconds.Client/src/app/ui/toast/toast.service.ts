import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  readonly id: number;
  /** Clé i18n, traduite par `ToastHostComponent`. */
  readonly messageKey: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly tone: ToastTone;
}

export interface ToastOptions {
  params?: Readonly<Record<string, unknown>>;
  tone?: ToastTone;
  /** 0 : reste affiché jusqu'à fermeture. */
  durationMs?: number;
}

export const DEFAULT_TOAST_DURATION_MS = 4000;
/** Au-delà, le plus ancien disparaît : l'écran n'est jamais couvert de toasts. */
export const MAX_VISIBLE_TOASTS = 3;

/** Messages éphémères de l'app, affichés par `<app-toast-host>` (posé une fois dans `App`). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<readonly Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach(timer => clearTimeout(timer)));
  }

  show(messageKey: string, options: ToastOptions = {}): number {
    const toast: Toast = { id: this.nextId++, messageKey, params: options.params, tone: options.tone ?? 'info' };
    const kept = this._toasts().slice(-(MAX_VISIBLE_TOASTS - 1));
    this._toasts().filter(t => !kept.includes(t)).forEach(t => this.clearTimer(t.id));
    this._toasts.set([...kept, toast]);

    const duration = options.durationMs ?? DEFAULT_TOAST_DURATION_MS;
    if (duration > 0) this.timers.set(toast.id, setTimeout(() => this.dismiss(toast.id), duration));
    return toast.id;
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this._toasts.update(toasts => toasts.filter(t => t.id !== id));
  }

  private clearTimer(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }
}
