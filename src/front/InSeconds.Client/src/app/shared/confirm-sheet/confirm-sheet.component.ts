import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

/** Teinte visuelle de la modale (couleur de bordure/titre). */
export type ConfirmSheetTone = 'danger' | 'warning';

interface ToneStyle {
  card: string;
  title: string;
}

const TONES: Record<ConfirmSheetTone, ToneStyle> = {
  danger:  { card: 'background:#1a0a0a;border:1px solid rgba(248,113,113,0.3)', title: 'color:var(--text-error)' },
  warning: { card: 'background:#1a0f00;border:1px solid rgba(251,191,36,0.3)', title: 'color:var(--color-warn)' },
};

/**
 * Bottom-sheet de confirmation réutilisable (overlay plein écran).
 * Bouton de confirmation à gauche, bouton d'annulation (mis en avant) à droite.
 */
@Component({
  selector: 'app-confirm-sheet',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './confirm-sheet.component.html',
})
export class ConfirmSheetComponent {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly tone = input<ConfirmSheetTone>('danger');
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  readonly loading = input(false);
  /** Style inline du bouton de confirmation (couleur selon le contexte). */
  readonly confirmStyle = input('background:var(--bg-danger);color:#fff');
  /** Style inline du bouton d'annulation (mis en avant par défaut). */
  readonly cancelStyle = input('background:var(--bg-surface);color:var(--text-slate);border:1px solid var(--border-subtle)');

  readonly confirm = output<void>();
  readonly cancelled = output<void>();

  protected toneStyle(): ToneStyle {
    return TONES[this.tone()];
  }
}
