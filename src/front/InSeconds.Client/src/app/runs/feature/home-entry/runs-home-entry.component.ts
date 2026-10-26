import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { SessionStore } from '../../../core/session/session.store';
import { provideRunsApi } from '../../data-access/runs.providers';
import { RunsApi } from '../../data-access/runs.api';
import { RunHomeCardComponent } from '../../ui/run-home-card/run-home-card.component';

/**
 * L'entrée de Platines sur l'accueil du jeu du jour, chargée à la demande (avec le client de l'API du mode, jamais dans le bundle initial) :
 * la carte n'apparaît que pour un compte connecté qui a l'accès (`GET /api/runs/me`, jamais appelé pour un invité). Sans accès ou sur une
 * erreur, rien n'est affiché.
 */
@Component({
  selector: 'app-runs-home-entry',
  imports: [RunHomeCardComponent],
  providers: [provideRunsApi()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (hasAccess()) {
      <div class="pt-6"><app-run-home-card /></div>
    }
  `,
})
export class RunsHomeEntryComponent {
  protected readonly hasAccess = signal(false);

  constructor() {
    const session = inject(SessionStore);
    const api = inject(RunsApi);
    let asked = false;
    effect(() => {
      // L'identité se lit au démarrage de l'app : on attend de savoir si c'est un compte.
      if (!session.isLinked()) {
        this.hasAccess.set(false);
        asked = false;
        return;
      }
      if (asked) return;
      asked = true;
      untracked(() => {
        api.me().then(me => this.hasAccess.set(me.hasAccess), () => this.hasAccess.set(false));
      });
    });
  }
}
