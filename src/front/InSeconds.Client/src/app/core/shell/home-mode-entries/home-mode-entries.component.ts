import { ChangeDetectionStrategy, Component, DestroyRef, ViewContainerRef, inject, viewChild } from '@angular/core';
import { HOME_MODE_ENTRIES } from './home-mode-entries';

/**
 * L'emplacement des entrées des autres modes (`HOME_MODE_ENTRIES`), chacune chargée à la demande et posée à sa place : rien n'est montré tant
 * qu'aucune n'est prête. (`ViewContainerRef` plutôt que `NgComponentOutlet`, qui alourdirait le bundle initial.)
 */
@Component({
  selector: 'app-home-mode-entries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-container #slot />',
})
export class HomeModeEntriesComponent {
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });

  constructor() {
    let destroyed = false;
    inject(DestroyRef).onDestroy(() => (destroyed = true));
    // Une entrée qui ne se charge pas (réseau) ne casse pas l'accueil : elle n'apparaît simplement pas.
    void Promise.all(inject(HOME_MODE_ENTRIES).map(entry => entry.load().catch(() => null))).then(components => {
      if (destroyed) return;
      for (const component of components) {
        if (component) this.slot().createComponent(component);
      }
    });
  }
}
