import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Bouton cloche des bruitages (barrée quand ils sont coupés ; une cloche, pas un haut-parleur : il ne coupe pas le son de l'extrait) : présentationnel, la page lui donne l'état et reçoit le basculement. */
@Component({
  selector: 'app-sound-toggle',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="relative inline-flex">
    @if (hint()) {
      <!-- Première manche : deux ondes cyan autour de la cloche et une bulle, pour dire qu'on peut couper les bruitages ici. Rien d'animé en mouvement réduit. -->
      <span class="hint-wave" aria-hidden="true"></span>
      <span class="hint-wave hint-wave-late" aria-hidden="true"></span>
      <span class="hint-tip" role="status" data-testid="sound-hint">
        <span>{{ 'ui.sound.hintTitle' | translate }}</span>
        <small>{{ 'ui.sound.hintBody' | translate }}</small>
      </span>
    }
    <button type="button" (click)="toggled.emit()" data-testid="sound-toggle" [attr.aria-pressed]="enabled()"
            [attr.aria-label]="(enabled() ? 'ui.sound.turnOff' : 'ui.sound.turnOn') | translate"
            class="inline-flex items-center justify-center rounded-full cursor-pointer touch-manipulation"
            [class]="ringed() ? 'size-10 shrink-0 hover:opacity-70' : 'size-11'"
            [style.border]="ringed() ? '1px solid var(--border-neutral)' : null"
            [style.color]="enabled() ? (ringed() ? 'var(--text-light)' : 'var(--text-body)') : 'var(--text-faint)'">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        @if (!enabled()) {
          <path d="M4 4l16 16" />
        }
      </svg>
    </button>
    </span>
  `,
  styles: `
    :host { display: contents; }
    .hint-wave {
      position: absolute; inset: 0; border-radius: 9999px; border: 2px solid var(--color-accent-2); opacity: 0; pointer-events: none;
      animation: sound-hint-wave 1.1s ease-out 2 both;
    }
    .hint-wave-late { animation-delay: 0.25s; }
    .hint-tip {
      position: absolute; right: calc(100% + 0.75rem); top: 50%; transform: translateY(-50%); z-index: 1; display: flex; flex-direction: column;
      height: 2.5rem; justify-content: center; padding: 0 0.75rem; white-space: nowrap; font-size: 0.8125rem; line-height: 1.15; pointer-events: none;
      color: var(--text-hi); background: var(--bg-surface-2); border: 1px solid var(--border-medium); border-radius: var(--radius-button);
      animation: sound-hint-tip 0.25s ease-out both;
    }
    .hint-tip small { font-size: 0.6875rem; color: var(--text-muted); }
    .hint-tip::after {
      content: ''; position: absolute; right: -0.3125rem; top: 50%; width: 0.5625rem; height: 0.5625rem; margin-top: -0.28rem; transform: rotate(45deg);
      background: var(--bg-surface-2); border-top: 1px solid var(--border-medium); border-right: 1px solid var(--border-medium);
    }
    @keyframes sound-hint-wave { 0% { opacity: 0.6; transform: scale(1); } 100% { opacity: 0; transform: scale(1.7); } }
    @keyframes sound-hint-tip { from { opacity: 0; transform: translateY(-50%) translateX(0.375rem); } to { opacity: 1; transform: translateY(-50%); } }
    @media (prefers-reduced-motion: reduce) { .hint-wave { display: none; } .hint-tip { animation: none; } }
  `,
})
export class SoundToggleComponent {
  readonly enabled = input.required<boolean>();
  /** Un rond à contour neutre, comme le rond Instagram de l'en-tête de l'accueil. */
  readonly ringed = input(false);
  /** Montre l'onde et la bulle d'invitation à couper les bruitages (la page décide quand, et pour combien de temps). */
  readonly hint = input(false);
  readonly toggled = output<void>();
}
