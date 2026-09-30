import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';

/**
 * Page d'attente des routes dont le domaine n'est pas encore construit en v2 (`/daily`,
 * `/account`, `/admin`, `/privacy`). Chaque domaine la remplace par ses vraies pages.
 */
@Component({
  selector: 'app-coming-soon-page',
  imports: [TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="da-bg relative min-h-dvh flex flex-col items-center justify-center p-6 text-center screen-enter">
      <app-decor-background />
      <p class="relative text-3xl font-extrabold tracking-tight font-display" style="color:var(--text-hi)">
        IN<span style="color:var(--color-accent)">//</span>SECONDS
      </p>
      <h1 class="relative mt-6 text-xl font-bold" style="color:var(--text-hi)">{{ 'shell.comingSoon.title' | translate }}</h1>
      <p class="relative mt-2 max-w-sm" style="color:var(--text-slate)">{{ 'shell.comingSoon.body' | translate }}</p>
    </main>
  `,
})
export class ComingSoonPage {}
