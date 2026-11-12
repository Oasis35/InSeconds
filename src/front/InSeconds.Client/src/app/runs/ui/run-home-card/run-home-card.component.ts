import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/** La carte Setlist de l'accueil et de l'écran « déjà joué » : disque doré, « Setlist », « Accès anticipé », « Vise le disque d'or. », chevron. Ouvre `/setlist`. */
@Component({
  selector: 'app-run-home-card',
  imports: [TranslatePipe, RouterLink, RunDiscComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/setlist" data-testid="run-home-card"
      class="flex items-center rounded-(--radius-card) transition-colors touch-manipulation hover:bg-white/[0.03]"
      [class.gap-4]="!compact()" [class.px-4]="!compact()" [class.py-3.5]="!compact()"
      [class.gap-3]="compact()" [class.px-3]="compact()" [class.py-2]="compact()"
      [style.background]="compact() ? 'transparent' : 'rgb(var(--rgb-surface) / 0.55)'"
      [style.border]="compact() ? '1px solid var(--border-neutral)' : '1px solid rgb(var(--rgb-warning) / 0.45)'"
      [attr.data-compact]="compact()">
      <app-run-disc class="shrink-0" disc="runs.discs.gold" [size]="compact() ? 32 : 52" />
      <span class="min-w-0 flex-1 text-left">
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="font-bold" [class.text-lg]="!compact()" [class.text-base]="compact()" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.welcome.title' | translate }}</span>
          <span class="px-2 py-0.5 rounded-md text-[0.8125rem] font-bold"
            style="color:var(--color-warn);background:rgb(var(--rgb-warning) / 0.14)">{{ 'runs.welcome.badge' | translate }}</span>
        </span>
        @if (!compact()) {
          <span class="block text-sm" style="color:var(--text-light)">{{ 'runs.welcome.tagline' | translate }}</span>
        }
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true" class="shrink-0" style="color:var(--color-warn)"><polyline points="9 6 15 12 9 18" /></svg>
    </a>
  `,
})
export class RunHomeCardComponent {
  /** Version discrète : le défi du jour n'est pas encore joué, « Commencer » reste le premier geste. */
  readonly compact = input(false);
}
