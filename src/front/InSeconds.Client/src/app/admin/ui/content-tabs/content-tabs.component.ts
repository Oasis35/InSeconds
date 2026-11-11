import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Les trois pages de l'onglet « Contenu » de l'admin : les morceaux du pool, les thèmes et le sas « À valider ». Une barre de puces en tête de
 * chacune ; le nombre de candidats à traiter s'affiche une fois le sas ouvert (avant, la page ne le connaît pas).
 */
@Component({
  selector: 'app-content-tabs',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="flex flex-wrap gap-1.5" [attr.aria-label]="'admin.content.label' | translate" data-testid="content-tabs">
      @for (item of items; track item.path) {
        <a [routerLink]="['/admin', item.path]" routerLinkActive="is-active" ariaCurrentWhenActive="page" [replaceUrl]="true"
          class="content-tab text-[13px] px-3 min-h-9 lg:min-h-8 inline-flex items-center rounded-full" style="border:1px solid var(--border-neutral)">
          {{ item.label | translate }}@if (item.path === 'a-valider' && candidates() !== null && candidates()! > 0) { · {{ candidates() }}}
        </a>
      }
    </nav>
  `,
  styles: `
    .content-tab { color: var(--text-muted); }
    .content-tab.is-active { color: var(--text-hi); background: var(--text-sep); }
  `,
})
export class ContentTabsComponent {
  /** Les candidats du sas encore à traiter ; `null` tant que le sas n'a pas été lu. */
  readonly candidates = input<number | null>(null);

  protected readonly items = [
    { path: 'catalogue', label: 'admin.content.pool' },
    { path: 'themes', label: 'admin.content.themes' },
    { path: 'a-valider', label: 'admin.content.candidates' },
  ] as const;
}
