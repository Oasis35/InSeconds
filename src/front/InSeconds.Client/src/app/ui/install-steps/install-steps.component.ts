import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Les deux étapes de Safari sur iPhone pour ajouter l'appli à l'écran d'accueil (rien à déclencher par le code, Safari ne le permet pas). */
@Component({
  selector: 'app-install-steps',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="flex flex-col gap-1.5 pl-5 list-decimal text-sm leading-snug" style="color:var(--text-light)" data-testid="install-steps">
      <li>
        <svg class="inline-block align-[-3px] mr-1" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-2)" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
        {{ 'pwa.install.step1' | translate }}
      </li>
      <li>{{ 'pwa.install.step2' | translate }}</li>
    </ol>
  `,
})
export class InstallStepsComponent {}
