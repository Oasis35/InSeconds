import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { enterHomeCard } from '../../../ui/motion/motion';
import { Group, avatarOf, initialOf } from '../../domain/group';
import { FriendPresence, FriendsCardView } from '../../domain/friends-card';

/**
 * La carte amis de l'accueil, sous la carte du défi. Tant que le défi du jour reste à faire : le groupe, « 3 sur 5 ont joué » et une pastille par
 * membre (pleine s'il a joué, éteinte sinon), **jamais un score**. Défi fait : « Potes, aujourd'hui », le haut du classement du jour, la ligne du
 * joueur en ambre. Dans plusieurs groupes : une rangée de pastilles en tête pour choisir celui qu'elle montre. Sans groupe : « Créer un groupe » ;
 * invité : « Créer un compte » en contour neutre (un groupe exige un compte). Un membre a en bas « Inviter un ami dans … » (le groupe en cours) et,
 * sous le maximum de groupes, « Créer un nouveau groupe » en lien souligné discret. Jamais la tuile de focus : contour plat, aucune lueur.
 */
@Component({
  selector: 'app-friends-home-card',
  imports: [TranslatePipe, RouterLink, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 py-4 flex flex-col gap-3" data-testid="friends-card" [attr.data-kind]="view().kind"
      style="background:var(--bg-surface);border:1px solid var(--border-medium)">
      @switch (view().kind) {
        @case ('guest') {
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'social.empty.title' | translate }}</h2>
            @if (showNew()) {
              <span class="shrink-0 inline-flex items-center h-[22px] px-2 rounded-md text-xs font-bold" data-testid="friends-card-new"
                style="color:var(--color-violet);border:1px solid rgb(var(--rgb-violet) / 0.6);background:rgb(var(--rgb-violet) / 0.12)">{{ 'social.announce.chip' | translate }}</span>
            }
          </div>
          <p class="text-sm leading-snug" style="color:var(--text-light)">{{ 'social.home.guestBody' | translate }}</p>
          @if (showLogin()) {
            <a appButton variant="neutral" [block]="true" routerLink="/account/login" data-testid="friends-card-login">{{ 'social.empty.createAccount' | translate }}</a>
          }
        }
        @case ('no_group') {
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'social.empty.title' | translate }}</h2>
            @if (showNew()) {
              <span class="shrink-0 inline-flex items-center h-[22px] px-2 rounded-md text-xs font-bold" data-testid="friends-card-new"
                style="color:var(--color-violet);border:1px solid rgb(var(--rgb-violet) / 0.6);background:rgb(var(--rgb-violet) / 0.12)">{{ 'social.announce.chip' | translate }}</span>
            }
          </div>
          <p class="text-sm leading-snug" style="color:var(--text-light)">{{ 'social.empty.body' | translate }}</p>
          <a appButton variant="accent" [block]="true" routerLink="/ranking/new" data-testid="friends-card-create">{{ 'social.empty.create' | translate }}</a>
        }
        @default {
          @if (groups().length > 1) {
            <!-- Plusieurs groupes : une pastille par groupe, celui qu'on regarde cerclé d'ambre (le même geste que « Tes amis ce jour-là »). -->
            <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="'social.home.groups' | translate" data-testid="friends-card-groups">
              @for (group of groups(); track group.id) {
                <button type="button" (click)="groupSelected.emit(group.id)" [attr.aria-pressed]="group.id === groupId()" [attr.data-testid]="'friends-card-group-' + group.id"
                  [attr.title]="group.name" class="min-h-11 max-w-full truncate px-3 text-[13px] rounded-(--radius-button) touch-manipulation"
                  [style.border]="group.id === groupId() ? '1px solid var(--color-accent-3)' : '1px solid var(--border-neutral)'"
                  [style.color]="group.id === groupId() ? 'var(--text-hi)' : 'var(--text-muted)'">{{ group.name }}</button>
              }
            </div>
          }
          <!-- Un nom long pousse « Classement du groupe » sous le titre au lieu de l'écraser en trois lignes. -->
          <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
            <h2 class="min-w-40 flex-1 break-words text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="friends-card-title">
              @if (view().kind === 'revealed') { {{ 'social.home.todayTitle' | translate: { name: title() } }} } @else { {{ title() }} }
            </h2>
            @if (groupId(); as id) {
              <a routerLink="/ranking" [queryParams]="rankingParams(id)" data-testid="friends-card-ranking"
                class="shrink-0 inline-flex items-center min-h-11 -my-2 text-sm underline underline-offset-4" style="color:var(--text-light)">
                {{ 'social.home.openRanking' | translate }}
              </a>
            }
          </div>

          @if (pending(); as pending) {
            <p class="text-sm leading-snug" style="color:var(--text-light)" data-testid="friends-card-played">
              @if (pending.total <= 1) {
                {{ 'social.home.alone' | translate }}
              } @else if (pending.played === 0) {
                {{ 'social.scores.playedNone' | translate }}
              } @else {
                {{ (pending.played === 1 ? 'social.scores.playedCountOne' : 'social.scores.playedCount') | translate: { played: pending.played, members: pending.total } }}
              }
            </p>
            @if (pending.total > 1) {
              <!-- Une pastille par membre : pleine (violet, les autres joueurs) s'il a fini son défi, éteinte sinon ; celle du joueur en contour ambre. -->
              <ul class="flex flex-wrap gap-2" data-testid="friends-card-members">
                @for (member of members(); track $index) {
                  <li class="flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold" data-testid="friends-card-member"
                    [attr.data-played]="member.played" [attr.data-me]="member.isMe ? 'true' : null" [attr.title]="member.isMe ? null : member.pseudo"
                    [style.background]="member.played ? 'var(--avatar-' + member.avatar + ')' : 'var(--bg-inactive)'"
                    [style.color]="member.played ? 'var(--text-hi)' : 'var(--text-faint)'"
                    [style.border]="member.isMe ? '1px solid var(--color-accent-3)' : member.played ? null : '1px solid var(--border-neutral)'">
                    <span aria-hidden="true">{{ member.initial }}</span>
                    <span class="sr-only">{{ member.label | translate: { name: member.pseudo } }}</span>
                  </li>
                }
              </ul>
            }
          }

          @if (rows(); as rows) {
            @if (rows.length === 0) {
              <p class="text-sm leading-snug" style="color:var(--text-light)" data-testid="friends-card-nobody">{{ 'social.home.nobodyFinished' | translate }}</p>
            } @else {
            <ol class="flex flex-col" data-testid="friends-card-top">
              @for (row of rows; track $index) {
                <li class="flex items-center gap-3 px-2 py-1.5 min-h-12" data-testid="friends-card-row" [attr.data-me]="row.isMe ? 'true' : null"
                  [style.border]="row.isMe ? '1px solid var(--color-accent-3)' : '1px solid transparent'" style="border-radius:var(--radius-button)"
                  [style.background]="row.isMe ? 'rgb(var(--rgb-accent-3) / 0.1)' : null">
                  <span class="w-5 text-sm tabular-nums" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-muted)'">{{ row.rank }}</span>
                  <span class="flex items-center justify-center w-8 h-8 shrink-0 rounded-full text-sm font-bold" aria-hidden="true"
                    [style.background]="row.isMe ? 'var(--color-accent-3)' : 'var(--avatar-' + row.avatar + ')'"
                    [style.color]="row.isMe ? 'var(--bg-page)' : 'var(--text-hi)'">{{ row.initial }}</span>
                  <span class="flex-1 min-w-0 truncate text-base" [class.font-bold]="row.isMe" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-hi)'">
                    @if (row.isMe) { {{ 'social.ranking.me' | translate }} } @else { {{ row.pseudo }} }
                  </span>
                  <span class="text-lg font-bold tabular-nums" style="font-family:var(--font-score)" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--color-violet)'"
                    data-testid="friends-card-score">{{ row.score }}</span>
                </li>
              }
            </ol>
            }
          }

          @if (groupId(); as id) {
            <!-- Inviter dans le groupe en cours, sans passer par le classement : le même partage que la page des classements. -->
            <button appButton type="button" variant="neutral" [block]="true" class="[overflow-wrap:anywhere]" (click)="invite.emit(id)" data-testid="friends-card-invite">
              @if (inviteState() === 'copied') { {{ 'social.invite.copied' | translate }} }
              @else if (inviteState() === 'failed') { {{ 'social.invite.failed' | translate }} }
              @else { {{ 'social.alone.invite' | translate }} }
            </button>
          }

          @if (canCreate()) {
            <!-- Déjà dans un groupe, on peut en ouvrir un autre tant qu'on n'a pas atteint le maximum : un lien discret, « Inviter un ami » reste le seul bouton. -->
            <a routerLink="/ranking/new" data-testid="friends-card-new-group"
              class="self-start inline-flex items-center min-h-11 -my-2 text-sm underline underline-offset-4 touch-manipulation" style="color:var(--text-light)">
              {{ 'social.home.newGroup' | translate }}
            </a>
          }
        }
      }
    </section>
  `,
})
export class FriendsHomeCardComponent {
  readonly view = input.required<FriendsCardView>();
  /** La langue des nombres (« 1 380 »). */
  readonly lang = input<'fr' | 'en'>('fr');
  /** Invité : « Créer un compte » ; masqué quand le jeu du jour montre déjà son propre appel (toast de série, partie en pause). */
  readonly showLogin = input(true);
  /** La pastille « Nouveau » (l'annonce des groupes, carte fermée) : seulement pour un invité ou un compte sans groupe. */
  readonly showNew = input(false);
  /** Les groupes du joueur : dès qu'il y en a plusieurs, une pastille chacun pour changer celui que la carte montre. */
  readonly groups = input<readonly Group[]>([]);
  /** Un membre qui n'a pas atteint le nombre maximal de groupes : « Créer un nouveau groupe » sous la carte. */
  readonly canCreate = input(false);
  /** Où en est le partage du lien du groupe (« Lien copié », « Copie impossible » quelques secondes), rendu par l'entrée qui le fait. */
  readonly inviteState = input<'idle' | 'copied' | 'failed'>('idle');
  /** Le joueur touche « Inviter un ami » : le groupe en cours. À traiter dans le clic (le menu de partage refuse un appel après un `await`). */
  readonly invite = output<number>();
  /** Le joueur touche la pastille d'un autre groupe. */
  readonly groupSelected = output<number>();

  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));

  protected readonly groupId = computed(() => {
    const view = this.view();
    return view.kind === 'pending' || view.kind === 'revealed' ? view.groupId : null;
  });

  protected readonly pending = computed(() => {
    const view = this.view();
    return view.kind === 'pending' ? view : null;
  });

  protected readonly members = computed(() =>
    (this.pending()?.members ?? []).map(member => ({ ...member, initial: initialOf(member.pseudo), avatar: avatarOf(member.pseudo), label: presenceLabel(member) })));

  protected readonly rows = computed(() => {
    const view = this.view();
    if (view.kind !== 'revealed') return null;
    const numbers = this.numbers();
    return view.top.map(row => ({
      rank: row.rank, pseudo: row.pseudo, isMe: row.isMe, initial: initialOf(row.pseudo), avatar: avatarOf(row.pseudo),
      score: row.score === null ? '' : numbers.format(row.score),
    }));
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Elle arrive juste après la carte du défi, avant la carte Survie.
    afterNextRender(() => enterHomeCard(this.host.nativeElement, 0.06));
  }

  /** « Classement » ouvre le groupe ; une fois le défi fait, directement sur « Aujourd'hui », le classement que la carte résume. */
  protected rankingParams(groupId: number): Record<string, string | number> {
    return this.view().kind === 'revealed' ? { group: groupId, period: 'today' } : { group: groupId };
  }

  /** Le nom du groupe : seul titre avant le défi, « Potes, aujourd'hui » après. */
  protected title(): string {
    const view = this.view();
    return view.kind === 'pending' || view.kind === 'revealed' ? view.name : '';
  }
}

/** Ce qu'un lecteur d'écran dit d'une pastille : une phrase accordée par cas (« Léa a joué », « Tu n'as pas encore joué »). */
function presenceLabel(member: FriendPresence): string {
  if (member.isMe) return member.played ? 'social.home.mePlayed' : 'social.home.meWaiting';
  return member.played ? 'social.home.memberPlayed' : 'social.home.memberWaiting';
}
