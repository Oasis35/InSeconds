import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HOME_MODE_ENTRIES } from './home-mode-entries';
import { HomeModeEntriesComponent } from './home-mode-entries.component';

@Component({ selector: 'app-test-entry', template: '<p data-testid="entry">Une entrée</p>' })
class TestEntryComponent {}

describe('HomeModeEntriesComponent', () => {
  async function render(providers: unknown[]) {
    TestBed.configureTestingModule({ providers: providers as never[] });
    const fixture = TestBed.createComponent(HomeModeEntriesComponent);
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
    const element = await render([{ provide: HOME_MODE_ENTRIES, multi: true, useValue: { load: () => Promise.resolve(TestEntryComponent) } }]);

    expect(element.querySelectorAll('[data-testid="entry"]')).toHaveLength(1);
  });

  it('une entrée qui ne se charge pas ne casse pas les autres', async () => {
    const element = await render([
      { provide: HOME_MODE_ENTRIES, multi: true, useValue: { load: () => Promise.reject(new Error('réseau')) } },
      { provide: HOME_MODE_ENTRIES, multi: true, useValue: { load: () => Promise.resolve(TestEntryComponent) } },
    ]);

    expect(element.querySelectorAll('[data-testid="entry"]')).toHaveLength(1);
  });
});
