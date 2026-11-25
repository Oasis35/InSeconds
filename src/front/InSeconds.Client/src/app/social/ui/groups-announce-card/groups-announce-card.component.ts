import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { AnnounceVariant } from '../../domain/groups-announce';

/**
 * La carte d'annonce des groupes, au-dessus du défi : pastille « Nouveau » en violet (la couleur des autres joueurs), un titre, une phrase et une
 * action selon le compte : « Créer un groupe » (sans groupe, contour ambre) ou « Créer un
 * nouveau groupe » (membre, contour neutre), chacun avec sa phrase ; aucune n'invite dans un groupe précis. Contour plat, jamais la
 * tuile de focus : le bouton plein reste celui du défi. La croix la ferme.
 */
@Component({
  selector: 'app-groups-announce-card',
  imports: [TranslatePipe, RouterLink, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 py-4 flex flex-col gap-3" data-testid="groups-announce" [attr.data-variant]="variant()"
      style="background:var(--bg-surface);border:1px solid var(--border-medium)">
      <div class="flex items-start justify-between gap-3">
        <span class="inline-flex items-center h-[22px] px-2 rounded-md text-xs font-bold"
          style="color:var(--color-violet);border:1px solid rgb(var(--rgb-violet) / 0.6);background:rgb(var(--rgb-violet) / 0.12)">{{ 'social.announce.chip' | translate }}</span>
        <button type="button" (click)="dismiss.emit()" data-testid="groups-announce-close" [attr.aria-label]="'social.announce.close' | translate"
          class="inline-flex items-center justify-center w-11 h-11 -mt-3 -mr-3 touch-manipulation" style="color:var(--text-light)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'social.announce.title' | translate }}</h2>
      @switch (variant()) {
        @case ('no_group') {
          <p class="text-sm leading-snug" style="color:var(--text-light)">{{ 'social.announce.noGroup' | translate }}</p>
          <a appButton variant="accent" [block]="true" routerLink="/ranking/new" data-testid="groups-announce-action">{{ 'social.empty.create' | translate }}</a>
        }
        @default {
          <!-- Déjà dans un groupe : sa propre phrase, « Créer un nouveau groupe » comme sur la carte amis, en contour neutre (l'ambre est pour qui n'a pas de groupe). -->
          <p class="text-sm leading-snug" style="color:var(--text-light)">{{ 'social.announce.member' | translate }}</p>
          <a appButton variant="neutral" [block]="true" routerLink="/ranking/new" data-testid="groups-announce-action">{{ 'social.home.newGroup' | translate }}</a>
        }
      }
    </section>
  `,
})
export class GroupsAnnounceCardComponent {
  readonly variant = input.required<AnnounceVariant>();
  readonly dismiss = output();
}
