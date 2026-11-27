import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Bouton haut-parleur des bruitages : présentationnel, la page lui donne l'état et reçoit le basculement. */
@Component({
  selector: 'app-sound-toggle',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="toggled.emit()" data-testid="sound-toggle" [attr.aria-pressed]="enabled()"
            [attr.aria-label]="(enabled() ? 'ui.sound.turnOff' : 'ui.sound.turnOn') | translate"
            class="inline-flex size-11 items-center justify-center rounded-full cursor-pointer touch-manipulation"
            [style.color]="enabled() ? 'var(--text-body)' : 'var(--text-faint)'">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
        @if (enabled()) {
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
        } @else {
          <path d="M16 9.5l4 5M20 9.5l-4 5" />
        }
      </svg>
    </button>
  `,
})
export class SoundToggleComponent {
  readonly enabled = input.required<boolean>();
  readonly toggled = output<void>();
}
