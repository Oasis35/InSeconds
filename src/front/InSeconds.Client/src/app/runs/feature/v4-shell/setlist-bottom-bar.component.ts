import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter, map } from 'rxjs';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';

/**
 * La barre du bas de la V4 : les pages du joueur, une ligne de liens légaux au-dessus. Visible seulement sous l'accès Setlist, sur le jeu du
 * jour et sur Setlist, et jamais pendant une manche. « Aujourd'hui » respire en cyan tant que le défi du jour n'est pas joué.
 */
@Component({
  selector: 'app-setlist-bottom-bar',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="fixed inset-x-0 bottom-0 z-30" data-testid="bottom-bar" style="background:var(--bg-page);border-top:1px solid var(--border-neutral)">
        <nav class="flex flex-wrap justify-center gap-x-4 text-xs" style="font-family:var(--font-body);color:var(--text-muted)">
          <a routerLink="/legal" class="py-2 whitespace-nowrap hover:underline" style="color:inherit">{{ 'daily.footer.legal' | translate }}</a>
          <a routerLink="/privacy" class="py-2 whitespace-nowrap hover:underline" style="color:inherit">{{ 'daily.footer.privacy' | translate }}</a>
          <a href="mailto:contact@inseconds.cc" class="py-2 whitespace-nowrap hover:underline" style="color:inherit">{{ 'daily.footer.contact' | translate }}</a>
        </nav>
        <nav class="flex" style="padding-bottom:env(safe-area-inset-bottom)" [attr.aria-label]="'runs.v4.bar.label' | translate">
          @for (tab of tabs(); track tab.link) {
            <a [routerLink]="tab.link" [attr.data-testid]="'tab-' + tab.id" [attr.aria-current]="tab.active ? 'page' : null"
               class="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs touch-manipulation"
               [style.color]="tab.active ? 'var(--accent-orange)' : 'var(--text-muted)'">
              <span class="relative" aria-hidden="true">
                @if (tab.id === 'daily') {
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                  @if (chrome.dailyDone() === false) {
                    <span class="bar-pulse absolute -top-0.5 -right-1 h-2 w-2 rounded-full" data-testid="daily-pending" style="background:var(--accent-cyan)"></span>
                  }
                } @else {
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>
                }
              </span>
              <span>{{ tab.labelKey | translate }}</span>
            </a>
          }
        </nav>
      </div>
    }
  `,
  styles: `
    .bar-pulse { animation: bar-pulse 2.4s ease-in-out infinite; }
    @keyframes bar-pulse { 50% { opacity: .35; transform: scale(1.4); } }
    @media (prefers-reduced-motion: reduce) { .bar-pulse { animation: none; } }
  `,
})
export class SetlistBottomBarComponent {
  protected readonly chrome = inject(ShellChromeStore);
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)),
    { initialValue: this.router.url },
  );

  private readonly section = computed<'daily' | 'setlist' | null>(() => {
    const path = this.url().split(/[?#]/)[0];
    if (path === '/daily' || path.startsWith('/daily/')) return 'daily';
    if (path === '/setlist' || path.startsWith('/setlist/')) return 'setlist';
    return null;
  });

  protected readonly visible = computed(() => this.chrome.v4() && !this.chrome.immersive() && this.section() !== null);

  protected readonly tabs = computed(() => [
    { id: 'daily', link: '/daily', labelKey: 'runs.v4.bar.daily', active: this.section() === 'daily' },
    { id: 'setlist', link: '/setlist', labelKey: 'runs.v4.bar.setlist', active: this.section() === 'setlist' },
  ]);

  constructor() {
    // La page réserve la place de la barre (règle `has-bottom-bar` de styles.scss).
    effect(onCleanup => {
      const root = this.doc.documentElement;
      if (this.visible()) root.classList.add('has-bottom-bar');
      onCleanup(() => root.classList.remove('has-bottom-bar'));
    });
  }
}
