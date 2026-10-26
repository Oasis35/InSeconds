import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Un morceau retiré de la manche (le serveur n'a plus trouvé son extrait), à la place du lecteur et de la saisie : une carte qui ne révèle rien
 * du morceau et dit le nouvel objectif, puis « Morceau suivant » (le clic qui lance le son suivant, géré par la page). À ne pas confondre avec
 * un extrait illisible (réseau, lien expiré), qui garde « Réessayer / Passer » du lecteur.
 */
@Component({
  selector: 'app-run-withdrawn-card',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4" data-testid="run-withdrawn">
      <section class="rounded-(--radius-card) px-5 py-6 flex flex-col items-center gap-3 text-center"
        style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)">
        <span class="w-16 h-16 rounded-full flex items-center justify-center" style="background:var(--bg-inactive);border:1px solid var(--border-strong);color:var(--text-light)">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        </span>
        <h2 class="text-lg font-bold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.withdrawn.title' | translate }}</h2>
        <p class="text-sm leading-relaxed" style="color:var(--text-light)" data-testid="run-withdrawn-body">
          {{ 'runs.withdrawn.body' | translate: { objective: objective() } }}
        </p>
      </section>

      <button type="button" (click)="next.emit()" data-testid="run-next-track"
        class="w-full py-4 rounded-(--radius-button) text-sm font-bold tracking-wide uppercase transition touch-manipulation"
        style="font-family:var(--font-display);letter-spacing:0.06em;background:var(--gradient-primary);color:var(--text-on-primary);box-shadow:var(--glow-primary)">
        {{ (endsRound() ? 'runs.answer.endRound' : 'runs.answer.next') | translate }}
      </button>
    </div>
  `,
})
export class RunWithdrawnCardComponent {
  /** Le nouvel objectif de la manche, abaissé par le retrait. */
  readonly objective = input.required<number>();
  /** C'était le dernier morceau de la manche : le bouton annonce la fin de la manche. */
  readonly endsRound = input(false);
  /** « Morceau suivant » : la page lance le son suivant dans ce clic. */
  readonly next = output();
}
