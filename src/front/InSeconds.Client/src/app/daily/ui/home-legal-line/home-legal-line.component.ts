import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * La ligne discrète des liens légaux (mentions légales, confidentialité, contact), posée sous la carte Setlist de l'accueil de la V4 : ils ont
 * quitté la barre du bas, qui ne porte plus que les quatre pages du joueur.
 */
@Component({
  selector: 'app-home-legal-line',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav class="flex flex-wrap justify-center gap-x-4 px-4 pt-3 pb-1 text-xs" data-testid="home-legal-line"
      style="font-family:var(--font-body);color:var(--text-muted)">
      <a routerLink="/legal" class="py-2 whitespace-nowrap hover:underline" style="color:inherit">{{ 'daily.footer.legal' | translate }}</a>
      <a routerLink="/privacy" class="py-2 whitespace-nowrap hover:underline" style="color:inherit">{{ 'daily.footer.privacy' | translate }}</a>
      <a href="mailto:contact@inseconds.cc" class="py-2 whitespace-nowrap hover:underline" style="color:inherit">{{ 'daily.footer.contact' | translate }}</a>
    </nav>
  `,
})
export class HomeLegalLineComponent {}
