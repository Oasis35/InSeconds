import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';

/**
 * Overlay plein écran quand l'API ne répond plus (panne ou redéploiement). Bloque l'interaction
 * et disparaît seul dès que `HealthService` voit l'API revenir. Repris de la v1.
 */
@Component({
  selector: 'app-service-down',
  imports: [TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './service-down.component.html',
})
export class ServiceDownComponent {}
