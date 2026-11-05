import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AnswerSearchStore } from '../../data-access/answer-search.store';
import { TrackRoundStore } from '../../data-access/track-round.store';
import { RoundResult } from '../../domain/round-result';
import { AnswerSuggestion } from '../../domain/answer';
import { RoundSubmission } from '../../domain/track-round';
import { AnswerInputComponent } from '../../ui/answer-input/answer-input.component';
import { HintPanelComponent } from '../../ui/hint-panel/hint-panel.component';
import { RevealCardComponent } from '../../ui/reveal-card/reveal-card.component';
import { RoundPlayerComponent } from '../../ui/round-player/round-player.component';
import { ButtonComponent } from '../../../ui/button/button.component';

/**
 * La manche d'un morceau, de l'écoute à la révélation : le lecteur, les indices, la saisie avec son
 * autocomplete, « Valider » et « Passer », puis la carte de révélation. Elle ne connaît pas le mode :
 * le mode fournit le `TrackRoundStore` (qu'il démarre avec ses paliers et ses indices), envoie la
 * réponse quand `answered` part, puis donne le `result` du serveur et appelle `reveal()` du store.
 *
 * Emplacements de projection du mode : `[roundActions]` (ses boutons, au-dessus de « Valider »),
 * `[roundBadge]` (à gauche de la pochette), `[roundScore]` (ses points) et `[roundNext]` (sa suite). En ligne
 * (`layout="inline"`, un mode à écoute fixe) : `[roundCorner]` (en haut à droite de la carte, son chrono), `[roundAids]` (au-dessus de la
 * saisie, dans les deux dispositions : les coups de pouce du mode) et `[roundReveal]` (sa révélation, dans la carte, à la place de la carte de révélation) ; « Passer »
 * y est un simple lien souligné sous « Valider ». Avec `choices`, la saisie devient autant de réponses à toucher (une seule est juste,
 * le serveur corrige comme une saisie).
 */
@Component({
  selector: 'app-track-round',
  imports: [TranslatePipe, ButtonComponent, RoundPlayerComponent, HintPanelComponent, AnswerInputComponent, RevealCardComponent],
  providers: [AnswerSearchStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let phase = round.phase();
    @if (phase !== null) {
      <!-- En ligne, toute la manche tient dans une carte (le lecteur, la saisie, puis la révélation du mode) ; son bord s'éclaircit quand
        le mode le demande (les dernières secondes de son chrono). -->
      <div class="relative flex flex-col" data-testid="track-round" [class.gap-4]="!inline()" [class.gap-3.5]="inline()"
        [class.p-3.5]="inline()" [class.inline-frame]="inline()" [class.alert]="inline() && alert()">
        @if (inline() && phase !== 'revealed' && phase !== 'audio-error' && phase !== 'no-preview') {
          <!-- Le coin du mode (son chrono), en haut à droite, au-dessus de la waveform ; pas sur le message d'un extrait illisible. -->
          <div class="absolute top-3.5 right-3.5 pointer-events-none"><ng-content select="[roundCorner]" /></div>
        }
        @if (phase !== 'revealed') {
          <app-round-player [layout]="layout()" [phase]="phase" [chosenSeconds]="round.chosenSeconds()" [steps]="round.steps()"
            [nextStep]="round.nextStep()" [position]="round.position()" [peaks]="round.waveform()?.peaks ?? null" [bass]="round.bass()"
            [stake]="round.stake()"
            (replay)="round.replay()" (listenMore)="round.listenMore()" (retry)="round.retryPlayback()" (skip)="skipUnplayable()" />
        }

        @if (round.showsInput()) {
          <form (submit)="onSubmit($event)" class="space-y-3">
            <app-hint-panel [levels]="round.availableHintLevels()" [kinds]="round.hintKinds()" [hints]="round.hints()" [pending]="hintPending()"
              (request)="hintRequested.emit($event)" />

            <ng-content select="[roundAids]" />

            @if (choices(); as options) {
              <!-- Les réponses proposées par le mode, à toucher : une seule est juste. -->
              <div class="grid gap-2" role="group" [attr.aria-label]="'gameplay.answer.choices' | translate" data-testid="round-choices">
                @for (option of options; track $index) {
                  <!-- La réponse touchée garde son contour à la couleur du joueur pendant l'envoi (« Valider » n'est plus là pour le dire). -->
                  <button type="button" class="text-left px-4 py-3 touch-manipulation break-words disabled:opacity-50"
                    style="min-height:48px;background:var(--bg-surface-2);border-width:1px;border-style:solid;border-radius:var(--radius-button);color:var(--text-hi)"
                    [style.border-color]="picked() === $index && phase === 'submitting' ? 'var(--color-accent)' : 'var(--border-strong)'"
                    [style.opacity]="picked() === $index && phase === 'submitting' ? 1 : null"
                    [disabled]="phase === 'submitting' || locked()" (click)="pickChoice(option, $index)" data-testid="round-choice">
                    <span class="font-semibold">{{ option.artist }}</span> <span style="color:var(--text-light)">- {{ option.title }}</span>
                  </button>
                }
              </div>
            } @else {
              <app-answer-input [query]="search.query()" [suggestions]="search.visibleSuggestions()" [highlighted]="search.highlighted()"
                (queryChange)="onQueryChange($event)" (pick)="search.select($event)" (enter)="onEnter($event)"
                (clear)="onClear()" (move)="search.moveHighlight($event)" (highlight)="search.highlight($event)"
                (dismiss)="search.close()" (focused)="search.openList()" (blurred)="search.close()" />
            }

            <ng-content select="[roundActions]" />

            @if (phase === 'submit-error') {
              <div class="rounded-xl px-4 py-3 space-y-3" style="background:rgb(var(--rgb-danger) / 0.08);border:1px solid rgb(var(--rgb-danger) / 0.3)">
                <p role="alert" class="text-sm text-center font-semibold" style="color:var(--text-error)">{{ 'gameplay.answer.submitFailed' | translate }}</p>
                <button appButton type="button" [block]="true" [glow]="true" (click)="retrySubmission()">
                  {{ 'gameplay.answer.retry' | translate }}
                </button>
              </div>
            } @else if (round.pendingConfirm(); as kind) {
              <div class="rounded-xl px-4 py-3 space-y-3" style="background:rgb(var(--rgb-accent) / 0.08);border:1px solid rgb(var(--rgb-accent) / 0.35)">
                <p class="text-sm text-center font-semibold" style="color:var(--color-accent)">
                  {{ (kind === 'skip' ? 'gameplay.answer.skipConfirm' : 'gameplay.answer.emptyConfirm') | translate }}
                </p>
                <div class="flex gap-2">
                  <button appButton type="button" variant="secondary" class="flex-1" (click)="round.cancelConfirm()">
                    {{ 'gameplay.answer.cancel' | translate }}
                  </button>
                  <button appButton type="button" class="flex-1" (click)="confirm()">
                    {{ (kind === 'skip' ? 'gameplay.answer.skipAnyway' : 'gameplay.answer.submitAnyway') | translate }}
                  </button>
                </div>
              </div>
            } @else {
              @if (!choices()) {
                <button appButton type="submit" [block]="true" [glow]="true" [disabled]="phase === 'submitting' || locked()">
                  {{ phase === 'submitting' ? '…' : ('gameplay.answer.validate' | translate) }}
                </button>
              }
              @if (inline()) {
                <div class="flex justify-center">
                  <button type="button" class="inline-flex items-center min-h-11 px-2 text-[15px] underline underline-offset-4 touch-manipulation disabled:opacity-50"
                    style="color:var(--text-light)" [disabled]="phase === 'submitting' || locked()" (click)="round.askSkip()" data-testid="round-skip">
                    {{ 'gameplay.round.skip' | translate }}
                  </button>
                </div>
              } @else {
                <button appButton type="button" variant="neutral" [block]="true" [disabled]="phase === 'submitting'" (click)="round.askSkip()">
                  {{ 'gameplay.round.skip' | translate }}
                </button>
              }
            }
          </form>
        }

        @if (phase === 'revealed') {
          @if (result(); as revealed) {
            <app-reveal-card [result]="revealed" [bass]="round.bass()">
              <ng-content select="[roundBadge]" ngProjectAs="[roundBadge]" />
              <ng-content select="[roundScore]" ngProjectAs="[roundScore]" />
              <ng-content select="[roundNext]" ngProjectAs="[roundNext]" />
            </app-reveal-card>
          }
          <!-- La révélation propre au mode, dans la carte (en ligne). -->
          <ng-content select="[roundReveal]" />
        }
      </div>
    }
  `,
  styles: `
    .inline-frame {
      background: var(--bg-surface);
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-card);
      transition: border-color 300ms;
    }
    .inline-frame.alert { border-color: rgb(var(--rgb-text) / 0.45); }
  `,
})
export class TrackRoundComponent {
  protected readonly round = inject(TrackRoundStore);
  protected readonly search = inject(AnswerSearchStore);

  /** Ce que le serveur a révélé (donné par le mode une fois la réponse enregistrée). */
  readonly result = input<RoundResult | null>(null);
  /** Le mode attend la réponse du back à une demande d'indice. */
  readonly hintPending = input(false);
  /** `inline` : toute la manche dans une carte, le bouton à gauche de la waveform (un mode à écoute fixe) ; `stacked` (défaut) : le Daily. */
  readonly layout = input<'stacked' | 'inline'>('stacked');
  /** Le bord de la carte s'éclaircit (en ligne seulement) : les dernières secondes du chrono du mode. */
  readonly alert = input(false);
  /** Le temps du mode est écoulé : la saisie part telle quelle, sans confirmation (une seule fois par morceau). */
  readonly timeUp = input(false);
  /** Les réponses à toucher qui remplacent la saisie (un coup de pouce du mode) ; vide : la saisie libre. */
  readonly choices = input<readonly AnswerSuggestion[] | null>(null);
  /**
   * Le mode traite une action sur ce morceau (un coup de pouce) : la réponse attend qu'il ait fini, sinon le serveur pourrait la corriger sur
   * un autre morceau. Le temps écoulé l'envoie quand même, une fois le verrou levé.
   */
  readonly locked = input(false);

  /** La réponse à envoyer ; le mode l'envoie, puis appelle `reveal()` ou `submissionFailed()` du store. */
  readonly answered = output<RoundSubmission>();
  /** Le joueur demande ce niveau d'indice ; le mode interroge le back, puis appelle `applyHints()` du store. */
  readonly hintRequested = output<number>();

  protected readonly inline = computed(() => this.layout() === 'inline');
  /** La réponse proposée touchée, le temps de l'envoi. */
  protected readonly picked = signal<number | null>(null);

  constructor() {
    // Un nouveau morceau (ou un morceau remplacé à la même place) repart d'une saisie vide.
    effect(() => {
      this.round.trackKey();
      untracked(() => {
        this.search.clear();
        this.picked.set(null);
      });
    });
    // Des réponses à toucher remplacent la saisie : ce qui était tapé disparaît avec le champ, il ne partira pas à la fin du temps.
    effect(() => {
      if (this.choices()) untracked(() => this.search.clear());
    });
    // Le temps écoulé envoie ce qui est tapé (rien avec des réponses à toucher) ; le domaine ne fait rien une fois la réponse partie.
    effect(() => {
      if (!this.timeUp() || this.locked()) return;
      untracked(() => {
        this.search.close();
        this.send(this.round.timeUp(this.choices() ? { artist: null, title: null } : this.search.answer()));
      });
    });
  }

  /** Toucher une des réponses proposées : elle part comme une saisie (artiste et titre). */
  protected pickChoice(option: AnswerSuggestion, index: number): void {
    if (this.locked()) return;
    this.picked.set(index);
    this.send(this.round.submit({ artist: option.artist, title: option.title }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.locked()) return;
    this.send(this.round.submit(this.search.answer()));
  }

  protected confirm(): void {
    if (this.locked()) return;
    this.send(this.round.confirm(this.search.answer()));
  }

  protected skipUnplayable(): void {
    this.send(this.round.skipUnplayable());
  }

  protected retrySubmission(): void {
    this.send(this.round.retrySubmission());
  }

  /** Retaper ferme la confirmation en attente : elle porterait sur l'ancienne saisie. */
  protected onQueryChange(query: string): void {
    this.search.setQuery(query);
    this.round.cancelConfirm();
  }

  /** Entrée dans le champ : une proposition en surbrillance est choisie (et le formulaire ne part pas), sinon la saisie se valide. */
  protected onEnter(event: KeyboardEvent): void {
    if (this.search.selectHighlighted()) event.preventDefault();
  }

  protected onClear(): void {
    this.search.clear();
    this.round.cancelConfirm();
  }

  private send(submission: RoundSubmission | null): void {
    if (submission) this.answered.emit(submission);
  }
}
