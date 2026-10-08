import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';

/** Confidentialité et mentions légales (repris de la v1) : une seule page, accessible depuis le pied de page du jeu. */
@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy.page.html',
})
export class PrivacyPage {
  protected readonly contactEmail = 'contact@inseconds.cc';
}
