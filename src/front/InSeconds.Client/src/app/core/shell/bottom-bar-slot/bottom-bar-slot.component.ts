import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, ViewContainerRef, inject } from '@angular/core';
import { BOTTOM_BAR_SLOT } from './bottom-bar-slot';

/**
 * L'emplacement de la barre du bas (`BOTTOM_BAR_SLOT`), chargée à la demande une fois l'app démarrée : le bundle initial ne la contient pas, et une
 * barre qui ne se charge pas (réseau) n'empêche rien.
 */
@Component({
  selector: 'app-bottom-bar-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class BottomBarSlotComponent implements OnInit {
  private readonly host = inject(ViewContainerRef);
  private readonly slot = inject(BOTTOM_BAR_SLOT);
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  ngOnInit(): void {
    if (!this.slot) return;
    void this.slot.load().then(component => {
      if (!this.destroyed) this.host.createComponent(component);
    }, () => undefined);
  }
}
