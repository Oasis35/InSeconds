import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Les deux pages de l'historique. Chaque mode a la sienne (les modes ne se connaissent pas) : ces onglets sont des liens. */
@Component({
  selector: 'app-history-tabs',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'ui.history.title' | translate }}</h1>
    <nav class="mt-4 flex gap-1 p-1" style="border:1px solid var(--border-neutral);border-radius:var(--radius-button)" [attr.aria-label]="'ui.history.title' | translate">
      @for (tab of tabs; track tab.id) {
        <a [routerLink]="tab.link" [attr.data-testid]="'history-tab-' + tab.id" [attr.aria-current]="active() === tab.id ? 'page' : null"
           class="flex-1 flex items-center justify-center min-h-11 text-sm touch-manipulation rounded-(--radius-button)"
           [class.font-semibold]="active() === tab.id"
           [style.border]="active() === tab.id ? '1px solid var(--color-accent-3)' : '1px solid transparent'"
           [style.color]="active() === tab.id ? 'var(--text-hi)' : 'var(--text-muted)'">{{ tab.labelKey | translate }}</a>
      }
    </nav>
  `,
})
export class HistoryTabsComponent {
  readonly active = input.required<'daily' | 'setlist'>();

  protected readonly tabs = [
    { id: 'daily', link: '/daily/history', labelKey: 'ui.history.tabs.daily' },
    { id: 'setlist', link: '/setlist/history', labelKey: 'ui.history.tabs.setlist' },
  ] as const;
}
