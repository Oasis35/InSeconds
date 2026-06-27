import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

/** Teinte visuelle de la modale (couleur de bordure/titre). */
export type ConfirmSheetTone = 'danger' | 'warning';

interface ToneStyle {
  card: string;
  title: string;
}

const TONES: Record<ConfirmSheetTone, ToneStyle> = {
  danger:  { card: 'background:#1a0a0a;border:1px solid rgba(248,113,113,0.3)', title: 'color:#fca5a5' },
  warning: { card: 'background:#1a0f00;border:1px solid rgba(251,191,36,0.3)', title: 'color:#fbbf24' },
};

/**
 * Bottom-sheet de confirmation réutilisable (overlay plein écran).
 * Bouton de confirmation à gauche, bouton d'annulation (mis en avant) à droite.
 */
@Component({
  selector: 'app-confirm-sheet',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="fixed inset-0 flex items-end justify-center px-4 pb-8" style="background:rgba(0,0,0,0.7);z-index:50">
      <div class="w-full max-w-lg rounded-2xl p-6 space-y-4" [style]="toneStyle().card">
        <p class="text-sm font-semibold" [style]="toneStyle().title">{{ title() }}</p>
        <p class="text-sm leading-relaxed" style="color:#e2e8f0;white-space:pre-line">{{ body() }}</p>
        <div class="flex gap-3 pt-1">
          <button (click)="confirm.emit()"
            [disabled]="loading()"
            class="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
            [style]="confirmStyle()">
            {{ loading() ? '…' : confirmLabel() }}
          </button>
          <button (click)="cancel.emit()"
            class="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
            [style]="cancelStyle()">
            {{ cancelLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmSheetComponent {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly tone = input<ConfirmSheetTone>('danger');
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  readonly loading = input(false);
  /** Style inline du bouton de confirmation (couleur selon le contexte). */
  readonly confirmStyle = input('background:#ef4444;color:#fff');
  /** Style inline du bouton d'annulation (mis en avant par défaut). */
  readonly cancelStyle = input('background:#0f0f1a;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)');

  readonly confirm = output<void>();
  readonly cancel = output<void>();

  protected toneStyle(): ToneStyle {
    return TONES[this.tone()];
  }
}
