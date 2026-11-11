import { ChangeDetectionStrategy, Component, DestroyRef, ViewContainerRef, effect, inject, untracked } from '@angular/core';
import { ErrorReportingService } from '../../errors/error-reporting.service';
import { ShellChromeStore } from '../shell-chrome.store';
import { BOTTOM_BAR_SLOT } from './bottom-bar-slot';

/**
 * L'emplacement de la barre du bas (`BOTTOM_BAR_SLOT`), chargée à la demande : seulement quand la V4 est active pour le joueur (les autres ne
 * téléchargent rien). Une barre qui ne se charge pas n'empêche rien, l'échec est remonté en avertissement.
 */
@Component({
  selector: 'app-bottom-bar-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class BottomBarSlotComponent {
  private readonly host = inject(ViewContainerRef);
  private readonly slot = inject(BOTTOM_BAR_SLOT);
  private readonly chrome = inject(ShellChromeStore);
  private readonly reporting = inject(ErrorReportingService);
  private destroyed = false;
  private loading = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    effect(() => {
      if (!this.chrome.v4() || !this.slot || this.loading) return;
      this.loading = true;
      untracked(() => {
        void this.slot!.load().then(component => {
          if (!this.destroyed) this.host.createComponent(component);
        }, () => {
          this.loading = false;
          this.reporting.report({ source: 'js', level: 'warning', message: 'BottomBar: chargement impossible' });
        });
      });
    });
  }
}
