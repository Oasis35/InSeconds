import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';

@Component({
  selector: 'app-not-found-page',
  imports: [TranslatePipe, RouterLink, ButtonComponent, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="da-bg relative min-h-dvh flex flex-col items-center justify-center p-6 text-center screen-enter">
      <app-decor-background />
      <p class="relative text-6xl font-extrabold font-display" style="color:var(--color-accent)">404</p>
      <h1 class="relative mt-4 text-xl font-bold" style="color:var(--text-hi)">{{ 'shell.notFound.title' | translate }}</h1>
      <p class="relative mt-2 mb-8 max-w-sm" style="color:var(--text-slate)">{{ 'shell.notFound.body' | translate }}</p>
      <a appButton class="relative" routerLink="/daily">{{ 'shell.notFound.cta' | translate }}</a>
    </main>
  `,
})
export class NotFoundPage {}
