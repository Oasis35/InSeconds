import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunRecord } from '../../domain/run';
import { ButtonComponent } from '../../../ui/button/button.component';

/**
 * L'accueil du mode : le nom, « accès anticipé », la promesse, le record du joueur s'il en a un, puis « Lancer une partie » (une playlist neuve ; une partie
 * en cours passe par l'écran de reprise). Le clic sur ce bouton est le geste qui déverrouille le son.
 */
@Component({
  selector: 'app-run-welcome-screen',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="screen-enter flex-1 flex flex-col items-center justify-center gap-6 text-center px-4" data-testid="run-welcome">
      <div class="space-y-3">
        <span class="inline-block px-3 py-1 rounded-full text-[0.6875rem] font-bold uppercase tracking-wider"
          style="color:var(--color-accent);background:rgb(var(--rgb-accent) / 0.14)">{{ 'runs.welcome.badge' | translate }}</span>
        <h1 class="text-3xl font-extrabold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.welcome.title' | translate }}</h1>
        <p class="text-base" style="color:var(--text-light)">{{ 'runs.welcome.tagline' | translate }}</p>
        @if (record(); as best) {
          <p class="text-sm" style="color:var(--text-faint)" data-testid="run-record">
            {{ 'runs.welcome.record' | translate: { score: best.bestScore } }}
          </p>
        }
      </div>
      <button appButton type="button" size="lg" [block]="true" [glow]="true" class="max-w-xs" (click)="start.emit()" data-testid="run-start">
        {{ 'runs.welcome.launch' | translate }}
      </button>
    </div>
  `,
})
export class RunWelcomeScreenComponent {
  readonly record = input<RunRecord | null>(null);
  readonly start = output();
}
