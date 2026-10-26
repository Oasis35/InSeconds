import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Partie abandonnée : un message simple et le compte à rebours jusqu'au prochain défi. */
@Component({
  selector: 'app-abandoned-screen',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="screen-enter flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
      <div class="space-y-4">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto" aria-hidden="true" style="color:var(--text-hi)">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>
        </svg>
        <h2 class="text-2xl font-bold tracking-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'daily.alreadyPlayed.abandonedTitle' | translate }}</h2>
        <p class="text-sm leading-relaxed" style="color:var(--text-muted)">{{ 'daily.alreadyPlayed.abandonedBody' | translate }}</p>
      </div>
      <div>
        <p class="text-sm font-semibold mb-1" style="font-family:var(--font-display);color:var(--text-muted)">{{ 'daily.alreadyPlayed.nextChallengeIn' | translate }}</p>
        <p class="text-2xl font-extrabold tabular-nums" style="font-family:var(--font-display);color:var(--text-body);letter-spacing:0.05em">{{ countdown() }}</p>
      </div>
    </div>
  `,
})
export class AbandonedScreenComponent {
  readonly countdown = input.required<string>();
}
