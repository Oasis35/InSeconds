import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { VersionService } from '../../version/version.service';

/** Politique de confidentialité (RGPD), accessible depuis le pied de page du jeu. Les mentions légales ont leur page (`/legal`). */
@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy.page.html',
})
export class PrivacyPage {
  protected readonly contactEmail = 'contact@inseconds.cc';

  constructor() {
    // Page de lecture seule : une nouvelle version peut s'appliquer tout de suite.
    inject(VersionService).allowReload(() => 'now', inject(DestroyRef));
  }
}
