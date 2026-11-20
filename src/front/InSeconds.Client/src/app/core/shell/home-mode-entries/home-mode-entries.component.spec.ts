import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HOME_MODE_ENTRIES } from './home-mode-entries';
import { HomeModeEntriesComponent } from './home-mode-entries.component';

@Component({ selector: 'app-test-entry', template: '<p data-testid="entry">Une entrée</p>' })
class TestEntryComponent {}

@Component({ selector: 'app-test-other', template: '<p data-testid="entry">Une autre</p>' })
class OtherEntryComponent {}

describe('HomeModeEntriesComponent', () => {
  async function render(providers: unknown[], placement?: 'all' | 'lead' | 'rest') {
    TestBed.configureTestingModule({ providers: providers as never[] });
    const fixture = TestBed.createComponent(HomeModeEntriesComponent);
    if (placement) fixture.componentRef.setInput('placement', placement);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('sans mode, rien', async () => {
    const element = await render([]);

    expect(element.querySelector('[data-testid="entry"]')).toBeNull();
  });

  it('pose l\'entrée de chaque mode, chargée à la demande', async () => {
    const element = await render([{ provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: 1, load: () => Promise.resolve(TestEntryComponent) } }]);

    expect(element.querySelectorAll('[data-testid="entry"]')).toHaveLength(1);
  });

  it('une entrée qui ne se charge pas ne casse pas les autres', async () => {
    const element = await render([
      { provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: 1, load: () => Promise.reject(new Error('réseau')) } },
      { provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: 2, load: () => Promise.resolve(TestEntryComponent) } },
    ]);

    expect(element.querySelectorAll('[data-testid="entry"]')).toHaveLength(1);
  });

  it("range les entrées par leur place, pas par l'ordre des fournisseurs", async () => {
    const element = await render([
      { provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: 20, load: () => Promise.resolve(OtherEntryComponent) } },
      { provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: 10, load: () => Promise.resolve(TestEntryComponent) } },
    ]);

    expect([...element.querySelectorAll('[data-testid="entry"]')].map(entry => entry.textContent)).toEqual(['Une entrée', 'Une autre']);
  });

  it('défi fait : l’emplacement de tête ne pose que les entrées qui passent devant, l’autre le reste', async () => {
    const providers = [
      { provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: 10, load: () => Promise.resolve(TestEntryComponent) } },
      { provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: 20, leadsWhenDailyDone: () => true, load: () => Promise.resolve(OtherEntryComponent) } },
    ];
    const texts = (element: HTMLElement) => [...element.querySelectorAll('[data-testid="entry"]')].map(entry => entry.textContent);

    expect(texts(await render(providers, 'lead'))).toEqual(['Une autre']);
    TestBed.resetTestingModule();
    expect(texts(await render(providers, 'rest'))).toEqual(['Une entrée']);
    TestBed.resetTestingModule();
    expect(texts(await render(providers))).toEqual(['Une entrée', 'Une autre']);
  });

  it('« tuile du moment » : seulement si une entrée de tête est posée et que sa carte s’affiche', async () => {
    async function leading(shows: boolean, load: () => Promise<unknown>) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: 20, leadsWhenDailyDone: () => shows, load } }] });
      const fixture = TestBed.createComponent(HomeModeEntriesComponent);
      fixture.componentRef.setInput('placement', 'lead');
      fixture.detectChanges();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      return fixture.componentInstance.hasLeadingEntry();
    }

    expect(await leading(true, () => Promise.resolve(OtherEntryComponent))).toBe(true);
    expect(await leading(false, () => Promise.resolve(OtherEntryComponent))).toBe(false);
    expect(await leading(true, () => Promise.reject(new Error('réseau')))).toBe(false);
  });
});
