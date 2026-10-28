import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { VersionService } from '../../version/version.service';

/** Mentions légales (LCEN) : éditeur, hébergeur, contenus musicaux Deezer. La confidentialité a sa propre page (`/privacy`). */
@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal.page.html',
})
export class LegalPage {
  protected readonly contactEmail = 'contact@inseconds.cc';

  constructor() {
    // Page de lecture seule : une nouvelle version peut s'appliquer tout de suite.
    inject(VersionService).allowReload(() => 'now', inject(DestroyRef));
  }
}
