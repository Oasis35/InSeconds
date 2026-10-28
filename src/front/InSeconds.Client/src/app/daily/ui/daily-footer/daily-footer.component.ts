import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Pied de page, en texte sur deux lignes serrées : mentions légales, confidentialité, contact, puis
 * Instagram et la langue (la langue courante en clair ; le parent change la langue). L'admin a son
 * lien dans le profil, les réponses des jours passés leur encart sur l'écran de résultat.
 */
@Component({
  selector: 'app-daily-footer',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-footer.component.html',
})
export class DailyFooterComponent {
  readonly lang = input.required<'fr' | 'en'>();
  readonly toggleLanguage = output<void>();

  protected readonly languages = ['fr', 'en'] as const;
}
