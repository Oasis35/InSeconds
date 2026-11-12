import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Le rond gris d'Instagram de l'en-tête de la V4 (la même adresse que le pied de page), à côté des accès du compte. */
@Component({
  selector: 'app-instagram-link',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="https://www.instagram.com/inseconds.cc/" target="_blank" rel="noopener noreferrer" data-testid="header-instagram"
       class="flex items-center justify-center w-10 h-10 shrink-0 rounded-full touch-manipulation hover:opacity-70"
       style="border:1px solid var(--border-neutral);color:var(--text-light)"
       [attr.aria-label]="'daily.footer.instagram' | translate" [title]="'daily.footer.instagram' | translate">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/>
      </svg>
    </a>
  `,
  host: { style: 'display:contents' },
})
export class InstagramLinkComponent {}
