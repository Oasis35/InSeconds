import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Pied de page : admin (rôle admin seulement), confidentialité, contact, bascule de langue (le parent change la langue). */
@Component({
  selector: 'app-daily-footer',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-footer.component.html',
})
export class DailyFooterComponent {
  readonly isAdmin = input.required<boolean>();
  readonly lang = input.required<'fr' | 'en'>();
  readonly toggleLanguage = output<void>();
}
