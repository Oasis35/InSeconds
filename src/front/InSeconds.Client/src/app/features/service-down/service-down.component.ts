import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';

/**
 * Overlay plein écran affiché quand le backend ne répond plus (KO ou redéploiement
 * en cours). Bloque l'interaction. Le polling de santé dans `App` fait disparaître
 * cet overlay automatiquement dès que le backend redevient joignable — aucune action
 * du joueur requise.
 */
@Component({
  selector: 'app-service-down',
  imports: [TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './service-down.component.html',
})
export class ServiceDownComponent {}
