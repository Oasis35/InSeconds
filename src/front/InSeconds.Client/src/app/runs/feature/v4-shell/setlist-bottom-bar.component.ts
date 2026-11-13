import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter, map } from 'rxjs';
import { SessionStore } from '../../../core/session/session.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';

/**
 * La barre du bas de la V4 : Accueil (le jeu du jour et la carte Setlist), Classement, Historique et Mon compte (« Connexion » pour un invité).
 * Visible seulement sous l'accès Setlist, sur l'accueil, sur Setlist, sur le classement, l'historique et le profil, et jamais pendant une manche.
 * « Accueil » respire en cyan tant que le défi du jour n'est pas joué. Les liens légaux ne sont plus dans la barre : ils vivent sous la carte Setlist.
 */
@Component({
  selector: 'app-setlist-bottom-bar',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="fixed inset-x-0 bottom-0 z-30" data-testid="bottom-bar" style="background:var(--bg-page);border-top:1px solid var(--border-neutral)">
        <nav class="flex w-full max-w-lg mx-auto" style="padding-bottom:env(safe-area-inset-bottom)" [attr.aria-label]="'runs.v4.bar.label' | translate">
          @for (tab of tabs(); track tab.link) {
            <a [routerLink]="tab.link" [attr.data-testid]="'tab-' + tab.id" [attr.aria-current]="tab.active ? 'page' : null"
               class="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs touch-manipulation min-h-11"
               [style.color]="tab.active ? 'var(--color-accent-3)' : 'var(--text-muted)'">
              <span class="relative" aria-hidden="true">
                @if (tab.id === 'daily') {
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                  @if (chrome.dailyDone() === false) {
                    <span class="bar-pulse absolute -top-0.5 -right-1 h-2 w-2 rounded-full" data-testid="daily-pending" style="background:var(--color-accent-2)"></span>
                  }
                } @else if (tab.id === 'account') {
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5"/></svg>
                } @else if (tab.id === 'ranking') {
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 20v-6M12 20V5M18 20v-9"/></svg>
                } @else {
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>
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
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)),
    { initialValue: this.router.url },
  );

  private readonly section = computed<'daily' | 'setlist' | 'ranking' | 'history' | 'account' | null>(() => {
    const path = this.url().split(/[?#]/)[0];
    // L'historique a une page par mode (`/daily/history`, `/setlist/history`) et un seul onglet.
    if (/^\/(daily|setlist)\/history(\/|$)/.test(path)) return 'history';
    // Le classement entre amis ; la création d'un groupe et le lien d'invitation sont des écrans pleins, sans barre.
    if (path === '/ranking') return 'ranking';
    // Mon compte : l'écran du profil existant ; la connexion et le reste du compte sont des écrans pleins, sans barre.
    if (path === '/account/profile') return 'account';
    if (path === '/daily' || path.startsWith('/daily/')) return 'daily';
    if (path === '/setlist' || path.startsWith('/setlist/')) return 'setlist';
    return null;
  });

  protected readonly visible = computed(() => this.chrome.v4() && !this.chrome.immersive() && this.section() !== null);

  /** Quatre entrées : Setlist n'a plus d'onglet (sa carte est sur l'accueil, qui reste allumé sur ses pages). */
  protected readonly tabs = computed(() => [
    { id: 'daily', link: '/daily', labelKey: 'runs.v4.bar.daily', active: this.section() === 'daily' || this.section() === 'setlist' },
    { id: 'ranking', link: '/ranking', labelKey: 'runs.v4.bar.ranking', active: this.section() === 'ranking' },
    { id: 'history', link: '/daily/history', labelKey: 'runs.v4.bar.history', active: this.section() === 'history' },
    this.session.isLinked()
      ? { id: 'account', link: '/account/profile', labelKey: 'runs.v4.bar.account', active: this.section() === 'account' }
      : { id: 'account', link: '/account/login', labelKey: 'runs.v4.bar.login', active: false },
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
