import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { SetlistAccessStore } from '../../data-access/setlist-access.store';
import { RunHomeCardComponent } from '../../ui/run-home-card/run-home-card.component';

/**
 * L'entrée de Setlist sur l'accueil du jeu du jour, chargée à la demande : la carte n'apparaît que pour un compte connecté qui a l'accès
 * (lu une fois par `SetlistAccessStore`, jamais pour un invité). Sans accès ou sur une erreur, rien n'est affiché.
 */
@Component({
  selector: 'app-runs-home-entry',
  imports: [RunHomeCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (access.hasAccess()) {
      <div class="pt-6"><app-run-home-card [compact]="chrome.dailyDone() === false" /></div>
    }
  `,
})
export class RunsHomeEntryComponent {
  protected readonly access = inject(SetlistAccessStore);
  protected readonly chrome = inject(ShellChromeStore);
}
