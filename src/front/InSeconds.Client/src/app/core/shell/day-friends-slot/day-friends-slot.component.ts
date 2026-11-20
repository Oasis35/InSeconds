import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Type, inject, input, signal } from '@angular/core';
import { ErrorReportingService } from '../../errors/error-reporting.service';
import { DAY_FRIENDS_SLOT } from './day-friends-slot';

/**
 * L'emplacement de « Tes amis ce jour-là » (`DAY_FRIENDS_SLOT`) : charge le composant une fois et lui passe le jour par `NgComponentOutlet`. Un
 * composant qui ne se charge pas n'empêche rien, l'échec est remonté en avertissement.
 */
@Component({
  selector: 'app-day-friends-slot',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (component(); as type) {
      <ng-container *ngComponentOutlet="type; inputs: { date: date() }" />
    }
  `,
})
export class DayFriendsSlotComponent {
  /** Le jour (`aaaa-mm-jj`). */
  readonly date = input.required<string>();

  protected readonly component = signal<Type<unknown> | null>(null);

  constructor() {
    const slot = inject(DAY_FRIENDS_SLOT);
    const reporting = inject(ErrorReportingService);
    slot?.load().then(
      type => this.component.set(type),
      () => reporting.report({ source: 'js', level: 'warning', message: 'DayFriends: chargement impossible' }),
    );
  }
}
