import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Type, inject, signal } from '@angular/core';
import { ErrorReportingService } from '../../errors/error-reporting.service';
import { HOME_ANNOUNCE } from './home-announce-slot';

/** L'emplacement de l'annonce de l'accueil (`HOME_ANNOUNCE`) : charge le composant fourni une fois ; un échec n'empêche rien, il est remonté en avertissement. */
@Component({
  selector: 'app-home-announce-slot',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (component(); as type) {
      <ng-container *ngComponentOutlet="type" />
    }
  `,
})
export class HomeAnnounceSlotComponent {
  protected readonly component = signal<Type<unknown> | null>(null);

  constructor() {
    const slot = inject(HOME_ANNOUNCE);
    const reporting = inject(ErrorReportingService);
    slot?.load().then(
      type => this.component.set(type),
      () => reporting.report({ source: 'js', level: 'warning', message: 'HomeAnnounce: chargement impossible' }),
    );
  }
}
