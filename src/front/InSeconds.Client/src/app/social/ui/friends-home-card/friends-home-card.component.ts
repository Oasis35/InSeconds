import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { enterHomeCard } from '../../../ui/motion/motion';
import { avatarOf, initialOf } from '../../domain/group';
import { FriendsCardView } from '../../domain/group-scores';

/**
 * La carte amis de l'accueil, sous la carte du défi. Tant que le défi du jour reste à faire : le groupe, « 3 sur 5 ont joué » et une pastille par
 * membre (pleine s'il a joué, éteinte sinon), **jamais un score**. Défi fait : « Potes, aujourd'hui », le haut du classement du jour, la ligne du
 * joueur en ambre. Sans groupe : « Créer un groupe » ; invité : « Créer un compte » en contour neutre (un groupe exige un compte). Jamais la tuile
 * de focus : contour plat, aucune lueur.
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
          <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'social.empty.title' | translate }}</h2>
          <p class="text-sm leading-snug" style="color:var(--text-light)">{{ 'social.home.guestBody' | translate }}</p>
          <a appButton variant="neutral" [block]="true" routerLink="/account/login" data-testid="friends-card-login">{{ 'social.empty.createAccount' | translate }}</a>
        }
        @case ('no_group') {
          <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'social.empty.title' | translate }}</h2>
          <p class="text-sm leading-snug" style="color:var(--text-light)">{{ 'social.empty.body' | translate }}</p>
          <a appButton variant="accent" [block]="true" routerLink="/ranking/new" data-testid="friends-card-create">{{ 'social.empty.create' | translate }}</a>
        }
        @default {
          <div class="flex items-center gap-3">
            <h2 class="min-w-0 flex-1 truncate text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="friends-card-title">
              @if (view().kind === 'revealed') { {{ 'social.home.todayTitle' | translate: { name: title() } }} } @else { {{ title() }} }
            </h2>
            @if (groupId(); as id) {
              <a routerLink="/ranking" [queryParams]="{ group: id }" data-testid="friends-card-ranking"
                class="shrink-0 inline-flex items-center min-h-11 -my-2 text-sm underline underline-offset-4" style="color:var(--text-light)">
                {{ 'social.ranking.title' | translate }}
              </a>
            }
          </div>

          @if (pending(); as pending) {
            <p class="text-sm leading-snug" style="color:var(--text-light)" data-testid="friends-card-played">
              @if (pending.total <= 1) {
                {{ 'social.home.alone' | translate }}
              } @else if (pending.played === 0) {
                {{ 'social.home.nobodyPlayed' | translate }}
              } @else {
                {{ (pending.played === 1 ? 'social.home.playedOne' : 'social.home.playedMany') | translate: { played: pending.played, total: pending.total } }}
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
                    [style.border]="member.isMe ? '1px solid var(--color-accent-3)' : null">
                    <span aria-hidden="true">{{ member.initial }}</span>
                    <span class="sr-only">{{ member.isMe ? ('social.ranking.me' | translate) : member.pseudo }} : {{ (member.played ? 'social.home.hasPlayed' : 'social.ranking.unplayed') | translate }}</span>
                  </li>
                }
              </ul>
            }
          }

          @if (rows(); as rows) {
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
      }
    </section>
  `,
})
export class FriendsHomeCardComponent {
  readonly view = input.required<FriendsCardView>();
  /** La langue des nombres (« 1 380 »). */
  readonly lang = input<'fr' | 'en'>('fr');

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
    (this.pending()?.members ?? []).map(member => ({ ...member, initial: initialOf(member.pseudo), avatar: avatarOf(member.pseudo) })));

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

  /** Le nom du groupe : seul titre avant le défi, « Potes, aujourd'hui » après. */
  protected title(): string {
    const view = this.view();
    return view.kind === 'pending' || view.kind === 'revealed' ? view.name : '';
  }
}
