import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { RunHitsStore } from '../../data-access/run-hits.store';

/**
 * La ligne « Hits 4 / 17 › » de l'accueil du mode et de la fin d'une partie : elle mène à l'écran des Hits et dit, à la couleur du joueur, quand
 * il vient d'en obtenir. Rien tant que les Hits ne sont pas lus : cette ligne est un plus.
 */
@Component({
  selector: 'app-run-hits-line',
  imports: [TranslatePipe, RouterLink],
  providers: [RunHitsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.status() === 'ready' && store.total() > 0) {
      <a routerLink="/setlist/hits" class="flex items-center justify-between gap-3 px-4 min-h-11 w-full max-w-xs mx-auto text-sm" data-testid="run-hits-line"
         style="border:1px solid var(--border-neutral);border-radius:var(--radius-button);color:var(--text-hi)">
        <span>{{ 'runs.hits.title' | translate }}</span>
        <span class="flex items-center gap-2">
          @if (store.fresh().length; as count) {
            <span class="font-bold" style="color:var(--color-accent-3)" data-testid="run-hits-fresh">{{ 'runs.hits.fresh' | translate: { count } }}</span>
          }
          <span class="tabular-nums" style="font-family:var(--font-clock);color:var(--text-muted)" data-testid="run-hits-count">{{ store.earnedCount() }} / {{ store.total() }}</span>
          <span aria-hidden="true" style="color:var(--text-muted)">›</span>
        </span>
      </a>
    }
  `,
})
export class RunHitsLineComponent {
  protected readonly store = inject(RunHitsStore);

  constructor() {
    void this.store.load(false);
  }
}
