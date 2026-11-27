import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Bouton cloche des bruitages (barrée quand ils sont coupés ; une cloche, pas un haut-parleur : il ne coupe pas le son de l'extrait) : présentationnel, la page lui donne l'état et reçoit le basculement. */
@Component({
  selector: 'app-sound-toggle',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
  `,
})
export class SoundToggleComponent {
  readonly enabled = input.required<boolean>();
  /** Un rond à contour neutre, comme le rond Instagram de l'en-tête de l'accueil. */
  readonly ringed = input(false);
  readonly toggled = output<void>();
}
