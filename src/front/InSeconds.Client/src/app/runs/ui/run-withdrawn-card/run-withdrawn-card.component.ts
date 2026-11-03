import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunNextButtonComponent } from '../run-next-button/run-next-button.component';

/**
 * Un morceau retiré de la manche (le serveur n'a plus trouvé son extrait), à la place de la carte du morceau : rien ne révèle le morceau, la
 * carte dit le nouvel objectif, puis « Morceau suivant » (le clic, ou l'enchaînement automatique, est géré par la page). À ne pas confondre avec
 * un extrait illisible (réseau, lien expiré), qui garde « Réessayer / Passer » du lecteur.
 */
@Component({
  selector: 'app-run-withdrawn-card',
  imports: [TranslatePipe, RunNextButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-3.5" data-testid="run-withdrawn"
      style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
      <div class="flex items-center gap-3">
        <span class="grid place-items-center rounded-full shrink-0" style="width:52px;height:52px;margin:6px;background:var(--bg-inactive);color:var(--text-light)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        </span>
        <div class="min-w-0">
          <h2 class="text-base font-semibold" style="color:var(--text-hi)">{{ 'runs.withdrawn.title' | translate }}</h2>
          <p class="text-sm leading-snug mt-0.5" style="color:var(--text-light)" data-testid="run-withdrawn-body">
            {{ 'runs.withdrawn.body' | translate: { objective: objective() } }}
          </p>
        </div>
      </div>
      <app-run-next-button class="block mt-3.5" [endsRun]="endsRun()" [auto]="auto()" (next)="next.emit()" />
    </section>
  `,
})
export class RunWithdrawnCardComponent {
  /** Le nouvel objectif de la manche, abaissé par le retrait. */
  readonly objective = input.required<number>();
  /** Le prochain clic mène à la fin de la partie. */
  readonly endsRun = input(false);
  /** L'enchaînement automatique est armé. */
  readonly auto = input(false);
  readonly next = output();
}
