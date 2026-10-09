import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../ui/button/button.component';
import { StoryRenderer } from '../data-access/story-renderer';
import { WeeklyStoryStore } from '../data-access/weekly-story.store';
import {
  CUSTOM_TITLE_MAX_LENGTH, StoryImage, StoryKind, TITLE_MODES, TitleMode, storyFileName,
} from '../domain/weekly-story';
import { WeeklyStoryVisualComponent } from '../ui/weekly-story-visual.component';

/**
 * Section « Stories Instagram hebdo » de l'onglet Actions : choix de la période, du titre et des
 * repères, bouton de génération, deux visuels 1080×1920 hors écran (le plus trouvé, le plus raté)
 * capturés en PNG puis proposés en miniatures téléchargeables.
 */
@Component({
  selector: 'app-weekly-story',
  imports: [TranslatePipe, ButtonComponent, WeeklyStoryVisualComponent],
  providers: [WeeklyStoryStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* fixed (et non absolute) : hors écran sans allonger la page de 2 × 1920 px. */
    .story-stage { position: fixed; left: -10000px; top: 0; }
  `,
  template: `
    <div class="flex flex-col gap-3" data-testid="weekly-story">
      <h2 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.actions.weeklyStory.title' | translate }}</h2>
      <p class="text-xs" style="color:var(--text-faint)">{{ 'admin.actions.weeklyStory.hint' | translate }}</p>
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 text-xs" style="color:var(--text-light)">
          {{ 'admin.actions.weeklyStory.from' | translate }}
          <input type="date" [value]="store.from()" [max]="store.to()" [disabled]="store.busy()"
            (change)="store.setFrom(valueOf($event))"
            class="text-sm rounded-lg px-2 py-1" style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-strong)" />
        </label>
        <label class="flex flex-col gap-1 text-xs" style="color:var(--text-light)">
          {{ 'admin.actions.weeklyStory.to' | translate }}
          <input type="date" [value]="store.to()" [min]="store.from()" [disabled]="store.busy()"
            (change)="store.setTo(valueOf($event))"
            class="text-sm rounded-lg px-2 py-1" style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-strong)" />
        </label>
        <label class="flex flex-col gap-1 text-xs" style="color:var(--text-light)">
          {{ 'admin.actions.weeklyStory.titleLabel' | translate }}
          <select [disabled]="store.busy()" (change)="setTitleMode(valueOf($event))"
            class="text-sm rounded-lg px-2 py-1" style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-strong)">
            @for (mode of titleModes; track mode) {
              <option [value]="mode" [selected]="mode === store.titleMode()">{{ 'admin.actions.weeklyStory.titleModes.' + mode | translate }}</option>
            }
          </select>
        </label>
        @if (store.titleMode() === 'custom') {
          <label for="weekly-story-custom-title" class="flex flex-col gap-1 text-xs flex-1 min-w-48" style="color:var(--text-light)">
            {{ 'admin.actions.weeklyStory.titleModes.custom' | translate }}
            <input id="weekly-story-custom-title" type="text" [value]="store.customTitle()" [attr.maxlength]="customTitleMaxLength" [disabled]="store.busy()"
              [placeholder]="'admin.actions.weeklyStory.customTitlePlaceholder' | translate"
              (change)="setCustomTitle(valueOf($event))"
              class="text-sm rounded-lg px-2 py-1" style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-strong)" />
          </label>
        }
      </div>
      @if (!store.periodValid()) {
        <span class="text-xs" style="color:var(--color-warn)">{{ 'admin.actions.weeklyStory.invalidPeriod' | translate }}</span>
      }
      <div class="flex flex-wrap items-center gap-3">
        <button appButton type="button" (click)="generate()" [disabled]="store.busy() || !store.periodValid()" data-testid="weekly-story-generate">
          @if (store.busy()) { <span>⏳</span> {{ 'admin.actions.weeklyStory.generating' | translate }} } @else { <span>📸</span> {{ 'admin.actions.weeklyStory.generate' | translate }} }
        </button>
        <label class="flex items-center gap-2 text-xs cursor-pointer" style="color:var(--text-light)">
          <input type="checkbox" [checked]="store.showGuides()" [disabled]="store.busy()" (change)="toggleGuides(checkedOf($event))" />
          {{ 'admin.actions.weeklyStory.showGuides' | translate }}
        </label>
        <label class="flex items-center gap-2 text-xs cursor-pointer" style="color:var(--text-light)">
          <input type="checkbox" [checked]="store.showPercent()" [disabled]="store.busy()" (change)="togglePercent(checkedOf($event))" />
          {{ 'admin.actions.weeklyStory.showPercent' | translate }}
        </label>
      </div>

      @if (store.status() === 'insufficient') {
        <span class="text-xs" style="color:var(--color-warn)">{{ 'admin.actions.weeklyStory.insufficient' | translate: { min: store.recap()?.minAnswers ?? 3 } }}</span>
      }
      @if (store.status() === 'error') {
        <span class="text-xs" style="color:var(--text-error)">{{ 'admin.actions.weeklyStory.error' | translate }}</span>
      }

      @if (store.status() === 'ready') {
        @if (!missed()) {
          <span class="text-xs" style="color:var(--color-warn)">{{ 'admin.actions.weeklyStory.onlyOne' | translate }}</span>
        }
        <div class="flex flex-wrap gap-4">
          @for (img of store.images(); track img.kind) {
            <div class="flex flex-col items-center gap-2">
              <img [src]="img.dataUrl" [alt]="'admin.actions.weeklyStory.' + img.kind | translate"
                class="rounded-lg" style="width:135px;height:240px;border:1px solid var(--border-strong)" />
              <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.actions.weeklyStory.' + img.kind | translate }}</span>
              <button appButton variant="secondary" size="sm" type="button" (click)="download(img)">⬇ {{ 'admin.actions.weeklyStory.download' | translate }}</button>
            </div>
          }
        </div>
        @if (store.images().length > 1) {
          <button appButton variant="secondary" type="button" class="self-start" (click)="downloadAll()">⬇ {{ 'admin.actions.weeklyStory.downloadAll' | translate }}</button>
        }
      }
    </div>

    <!-- Visuels capturés en PNG : hors écran, tant qu'un récap exploitable est chargé. -->
    @if (store.recap(); as recap) {
      @if (recap.status === 'ok') {
        <div class="story-stage" data-story-stage aria-hidden="true">
          @if (recap.mostFound; as track) {
            <app-weekly-story-visual kind="found" [track]="track" [from]="recap.from" [to]="recap.to"
              [heading]="store.title()" [showPercent]="store.showPercent()" [showGuides]="store.showGuides()" />
          }
          @if (recap.mostMissed; as track) {
            <app-weekly-story-visual kind="missed" [track]="track" [from]="recap.from" [to]="recap.to"
              [heading]="store.title()" [showPercent]="store.showPercent()" [showGuides]="store.showGuides()" />
          }
        </div>
      }
    }
  `,
})
export class WeeklyStoryComponent {
  protected readonly store = inject(WeeklyStoryStore);
  private readonly renderer = inject(StoryRenderer);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  protected readonly missed = computed(() => this.store.recap()?.mostMissed ?? null);
  protected readonly titleModes = TITLE_MODES;
  protected readonly customTitleMaxLength = CUSTOM_TITLE_MAX_LENGTH;

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected checkedOf(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  async generate(): Promise<void> {
    if (this.store.busy() || !this.store.periodValid()) return;
    if (!(await this.store.load())) return;
    await this.render();
  }

  /** Recapture à partir du récap déjà chargé (après un changement de repères, de pourcentage ou de titre). */
  async render(): Promise<void> {
    const recap = this.store.recap();
    if (recap?.status !== 'ok') return;
    this.store.startRendering();
    try {
      // Les visuels n'existent qu'une fois le récap affiché : rendu synchrone avant la capture.
      this.changeDetector.detectChanges();
      await this.renderer.prepare();
      const images: StoryImage[] = [];
      for (const element of this.visuals()) {
        const kind = element.dataset['story'] as StoryKind;
        images.push({ kind, dataUrl: await this.renderer.capture(element), fileName: storyFileName(kind, recap.to) });
      }
      this.store.setImages(images);
    } catch {
      this.store.failRendering();
    }
    this.changeDetector.markForCheck();
  }

  protected toggleGuides(show: boolean): void {
    this.store.setShowGuides(show);
    this.rerender();
  }

  protected togglePercent(show: boolean): void {
    this.store.setShowPercent(show);
    this.rerender();
  }

  protected setTitleMode(mode: string): void {
    this.store.setTitleMode(mode as TitleMode);
    this.rerender();
  }

  /** Appelé à la validation du champ (change), pas à chaque frappe : une capture coûte environ une seconde. */
  protected setCustomTitle(text: string): void {
    this.store.setCustomTitle(text);
    if (this.store.titleMode() === 'custom') this.rerender();
  }

  protected downloadAll(): void {
    for (const image of this.store.images()) this.download(image);
  }

  protected download(image: StoryImage): void {
    const link = document.createElement('a');
    link.href = image.dataUrl;
    link.download = image.fileName;
    link.click();
  }

  private rerender(): void {
    if (this.store.status() === 'ready') void this.render();
  }

  private visuals(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-story]'));
  }
}
