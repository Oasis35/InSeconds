import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Onglet de l'admin dont le module n'est pas encore construit en v2 (F2). Contrairement à la page
 * d'attente plein écran de la coquille, elle s'affiche sous la barre des onglets, qui reste utilisable.
 */
@Component({
  selector: 'app-tab-coming-soon-page',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full justify-center' },
  template: `
    <section class="w-full max-w-2xl flex flex-col items-center gap-2 py-10 text-center" data-testid="admin-tab-coming-soon">
      <h2 class="text-lg font-bold" style="color:var(--text-hi)">{{ 'shell.comingSoon.title' | translate }}</h2>
      <p class="text-sm" style="color:var(--text-slate)">{{ 'shell.comingSoon.body' | translate }}</p>
    </section>
  `,
})
export class TabComingSoonPage {}
