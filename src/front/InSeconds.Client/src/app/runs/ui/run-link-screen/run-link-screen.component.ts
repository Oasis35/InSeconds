import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandComponent } from '../../../gameplay/ui/brand/brand.component';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { RunLink } from '../../domain/run';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/**
 * Le lien reçu : ce que voit un ami qui ouvre `/runs/<code>` sans avoir joué cette playlist, invité compris, avec ou sans accès à Platines. Le logo
 * seul en haut (ni série ni compte : l'écran doit marcher pour un invité tout neuf), le disque d'or, « Clément te lance une playlist » (« Invité » à
 * défaut), quatre règles courtes tirées des règles figées de la playlist, puis « Jouer », le clic qui crée l'invité si besoin et lance le premier
 * son (iPhone). Ni surtitre ni nombre de joueurs.
 */
@Component({
  selector: 'app-run-link-screen',
  imports: [TranslatePipe, SecondsPipe, BrandComponent, RunDiscComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col' },
  template: `
    <app-brand [homeLink]="true" />
    <div class="screen-enter flex-1 flex flex-col items-center justify-center gap-6 py-6" data-testid="run-link">
      <app-run-disc disc="runs.discs.gold" [size]="96" />
      <h1 class="text-2xl font-extrabold text-center leading-tight" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-link-title">
        {{ 'runs.link.title' | translate: { pseudo: link().authorPseudo ?? ('runs.link.guest' | translate) } }}
      </h1>
      <ul class="w-full space-y-3 rounded-(--radius-card) p-4 text-sm" style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle);color:var(--text-light)"
        data-testid="run-link-rules">
        <li>{{ 'runs.link.tracks' | translate: { tracks: link().trackCount } }}</li>
        <li>{{ 'runs.link.rounds' | translate: { rounds: link().rounds } }}</li>
        <li>{{ 'runs.link.listen' | translate: { seconds: link().listenSeconds | appSeconds } }}</li>
        <li class="flex items-start gap-2">
          <app-run-disc class="shrink-0 mt-0.5" disc="runs.discs.gold" [size]="18" />
          <span>{{ 'runs.link.goal' | translate: { rounds: link().rounds } }}</span>
        </li>
      </ul>
      <button type="button" (click)="play.emit()" data-testid="run-link-play"
        class="w-full py-4 rounded-(--radius-button) text-sm font-bold tracking-wide uppercase transition touch-manipulation"
        style="font-family:var(--font-display);letter-spacing:0.06em;background:var(--gradient-primary);color:var(--text-on-primary);box-shadow:var(--glow-primary)">
        {{ 'runs.link.play' | translate }}
      </button>
    </div>
  `,
})
export class RunLinkScreenComponent {
  readonly link = input.required<RunLink>();
  /** « Jouer » : la page lance la partie et son premier son dans ce clic. */
  readonly play = output();
}
