import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, ViewContainerRef, inject, viewChild } from '@angular/core';
import { HOME_MODE_ENTRIES } from './home-mode-entries';

/**
 * L'emplacement des entrées des autres domaines (`HOME_MODE_ENTRIES`), chacune chargée à la demande et posée à sa place (`order`, quel que soit
 * l'ordre des fournisseurs) : rien n'est montré tant qu'aucune n'est prête. (`ViewContainerRef` plutôt que `NgComponentOutlet`, qui alourdirait le bundle initial.)
 */
@Component({
  selector: 'app-home-mode-entries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-container #slot />',
})
export class HomeModeEntriesComponent implements OnInit {
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });
  private readonly entries = inject(HOME_MODE_ENTRIES);
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  ngOnInit(): void {
    // Une entrée qui ne se charge pas (réseau) ne casse pas l'accueil : elle n'apparaît simplement pas.
    const entries = [...this.entries].sort((a, b) => a.order - b.order);
    void Promise.all(entries.map(entry => entry.load().catch(() => null))).then(components => {
      if (this.destroyed) return;
      for (const component of components) {
        if (component) this.slot().createComponent(component);
      }
    });
  }
}
