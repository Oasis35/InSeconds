import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Pop-up affichée quand l'utilisateur arrive via l'ancienne URL Northflank du front
 * (`p01--front--…code.run`), redirigée en 301 vers inseconds.cc par `nginx.conf` avec
 * `?from=legacy`. Invite à mettre à jour le favori. `App` détecte le paramètre,
 * affiche ce composant puis nettoie l'URL (le param n'est donc pas persistant).
 */
@Component({
  selector: 'app-legacy-url-notice',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legacy-url-notice.component.html',
})
export class LegacyUrlNoticeComponent {
  readonly dismissed = output<void>();
}
