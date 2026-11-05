import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';

/** Un choix du menu ▾ : son identifiant (rendu par `optionChosen`), son libellé et un aperçu du texte qu'il partage. */
export interface ShareOption {
  readonly id: string;
  readonly labelKey: string;
  readonly preview: string;
}

/**
 * Le bouton de partage de la fin d'une partie, commun aux modes (un mode n'importe pas l'autre) : « Partager mon score » au Daily, « Partager la
 * playlist » aux Platines. Chaque mode donne ses clés de traduction ; les défauts sont ceux du Daily.
 *
 * Avec des `options`, le bouton est scindé : la partie principale partage comme avant (`share`), la flèche ▾ ouvre un menu sous le bouton, un
 * choix par option avec l'aperçu de son texte (`optionChosen`). Le choix part dans le toucher lui-même (le menu de partage du téléphone l'exige).
 * Le menu se ferme au choix, à Échap, ou en touchant ailleurs.
 */
@Component({
  selector: 'app-share-button',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './share-button.component.html',
  styleUrl: './share-button.component.scss',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
})
export class ShareButtonComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly copied = input.required<boolean>();
  readonly failed = input(false);
  readonly disabled = input(false);
  readonly labelKey = input('daily.share.button');
  readonly copiedKey = input('daily.share.copied');
  readonly failedKey = input('daily.share.failed');
  readonly chooseKey = input('daily.share.choose');
  readonly options = input<readonly ShareOption[]>([]);
  readonly share = output<void>();
  readonly optionChosen = output<string>();

  protected readonly menuOpen = signal(false);

  protected toggleMenu(): void {
    this.menuOpen.update(open => !open);
  }

  protected choose(option: ShareOption): void {
    this.menuOpen.set(false);
    this.optionChosen.emit(option.id);
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }
}
