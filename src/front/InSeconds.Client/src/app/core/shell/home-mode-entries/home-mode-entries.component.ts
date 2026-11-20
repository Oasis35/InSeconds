import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, ViewContainerRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { HOME_MODE_ENTRIES, HomeEntryPlacement, HomeModeEntry } from './home-mode-entries';

/**
 * L'emplacement des entrées des autres domaines (`HOME_MODE_ENTRIES`), chacune chargée à la demande et posée à sa place (`order`, quel que soit
 * l'ordre des fournisseurs) : rien n'est montré tant qu'aucune n'est prête. (`ViewContainerRef` plutôt que `NgComponentOutlet`, qui alourdirait le bundle initial.)
 */
@Component({
  selector: 'app-home-mode-entries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-container #slot />',
})
export class HomeModeEntriesComponent implements OnInit {
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });
  private readonly entries = inject(HOME_MODE_ENTRIES);
  /** `lead` : les entrées qui passent au-dessus du résultat du jour ; `rest` : les autres ; `all` (défaut) : toutes. Lu une fois, à la création. */
  readonly placement = input<HomeEntryPlacement>('all');
  private destroyed = false;
  /** Les entrées réellement posées (une entrée qui ne se charge pas n'y est pas). */
  private readonly placedEntries = signal<readonly HomeModeEntry[]>([]);
  /** Une entrée de tête est posée et sa carte s'affiche : elle est la tuile du moment, le reste de l'accueil s'efface devant elle. */
  readonly hasLeadingEntry = computed(() => this.placedEntries().some(entry => entry.leadsWhenDailyDone?.() === true));

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  ngOnInit(): void {
    // Une entrée qui ne se charge pas (réseau) ne casse pas l'accueil : elle n'apparaît simplement pas.
    const entries = this.entries.filter(entry => placed(entry, this.placement())).sort((a, b) => a.order - b.order);
    void Promise.all(entries.map(entry => entry.load().catch(() => null))).then(components => {
      if (this.destroyed) return;
      for (const component of components) {
        if (component) this.slot().createComponent(component);
      }
      this.placedEntries.set(entries.filter((_, i) => components[i] !== null));
    });
  }
}

function placed(entry: HomeModeEntry, placement: HomeEntryPlacement): boolean {
  if (placement === 'all') return true;
  return (entry.leadsWhenDailyDone !== undefined) === (placement === 'lead');
}
