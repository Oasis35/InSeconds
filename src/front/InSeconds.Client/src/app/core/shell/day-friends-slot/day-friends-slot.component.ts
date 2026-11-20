import { ChangeDetectionStrategy, Component, ComponentRef, DestroyRef, ViewContainerRef, effect, inject, input, untracked } from '@angular/core';
import { ErrorReportingService } from '../../errors/error-reporting.service';
import { DAY_FRIENDS_SLOT } from './day-friends-slot';

/**
 * L'emplacement de « Tes amis ce jour-là » (`DAY_FRIENDS_SLOT`) : charge le composant une fois et lui passe le jour à chaque changement. Un
 * composant qui ne se charge pas n'empêche rien, l'échec est remonté en avertissement.
 */
@Component({
  selector: 'app-day-friends-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class DayFriendsSlotComponent {
  /** Le jour (`aaaa-mm-jj`). */
  readonly date = input.required<string>();

  private readonly host = inject(ViewContainerRef);
  private readonly slot = inject(DAY_FRIENDS_SLOT);
  private readonly reporting = inject(ErrorReportingService);
  private component: ComponentRef<unknown> | null = null;
  private loading = false;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    effect(() => {
      const date = this.date();
      untracked(() => {
        if (this.component) {
          this.component.setInput('date', date);
          return;
        }
        if (!this.slot || this.loading) return;
        this.loading = true;
        void this.slot.load().then(type => {
          if (this.destroyed) return;
          this.component = this.host.createComponent(type);
          this.component.setInput('date', this.date());
        }, () => {
          this.loading = false;
          this.reporting.report({ source: 'js', level: 'warning', message: 'DayFriends: chargement impossible' });
        });
      });
    });
  }
}
