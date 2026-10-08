import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';
import { HeaderSlot } from './header-slot';

/**
 * En-tête de l'app : l'avatar du compte connecté (initiale du pseudo, mène au profil) à droite, ou
 * un lien « Se connecter » pour un invité ou un visiteur (rien tant que l'identité n'est pas lue). À gauche, l'emplacement que la page courante remplit
 * (`HeaderSlot` : la gélule de série du jeu du jour), vide sinon. Posé en superposition en haut de page : il ne
 * décale aucun écran.
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink, TranslatePipe, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 p-4">
      <div data-testid="header-streak">
        @if (slot.left(); as template) {
          <ng-container [ngTemplateOutlet]="template" />
        }
      </div>
      @if (!session.loaded()) {
        <!-- Identité pas encore lue : ni avatar ni « Se connecter » (sinon un compte connecté voit un instant le lien). -->
      } @else if (session.isLinked()) {
        <a routerLink="/account/profile" class="app-avatar" [attr.title]="pseudo()" [attr.aria-label]="'shell.header.profile' | translate">
          {{ initial() }}
        </a>
      } @else {
        <a routerLink="/account/login" class="text-sm font-semibold" style="color:var(--text-muted)">
          {{ 'shell.header.login' | translate }}
        </a>
      }
    </div>
  `,
  styles: `
    :host { position: relative; display: block; height: 0; }
    .app-avatar {
      display: flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem;
      border-radius: 9999px; font-family: var(--font-display); font-weight: 700; text-transform: uppercase;
      color: var(--text-on-primary); background: var(--gradient-primary); box-shadow: var(--glow-primary);
      text-decoration: none;
    }
    .app-avatar:focus-visible { outline: 2px solid var(--color-accent-2); outline-offset: 2px; }
  `,
})
export class AppHeaderComponent {
  protected readonly session = inject(SessionStore);
  protected readonly slot = inject(HeaderSlot);

  protected readonly pseudo = computed(() => this.session.player()?.pseudo ?? '');
  protected readonly initial = computed(() => [...this.pseudo()][0] ?? '?');
}
