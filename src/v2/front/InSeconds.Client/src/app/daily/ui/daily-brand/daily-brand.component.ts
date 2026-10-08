import { Component, ChangeDetectionStrategy } from '@angular/core';

/** Titre IN//SECONDS centré dans la barre arrondie floutée de l'en-tête. */
@Component({
  selector: 'app-daily-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-brand.component.html',
  // sticky sur l'hôte : posé sur l'enfant, il resterait borné par la hauteur de l'hôte.
  host: { class: 'sticky top-2 z-10 block' },
})
export class DailyBrandComponent {}
