import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BOTTOM_BAR_SLOT } from './bottom-bar-slot';
import { BottomBarSlotComponent } from './bottom-bar-slot.component';

@Component({ selector: 'app-fake-bar', template: '<nav data-testid="fake-bar"></nav>' })
class FakeBar {}

describe('BottomBarSlotComponent', () => {
  it('ne montre rien sans barre fournie', async () => {
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).parentElement?.querySelector('nav')).toBeNull();
  });

  it('charge la barre fournie à la demande', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: BOTTOM_BAR_SLOT, useValue: { load: async () => FakeBar } }] });
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).parentElement?.querySelector('[data-testid="fake-bar"]')).not.toBeNull();
  });

  it("une barre qui ne se charge pas n'empêche rien", async () => {
    TestBed.configureTestingModule({ providers: [{ provide: BOTTOM_BAR_SLOT, useValue: { load: () => Promise.reject(new Error('réseau')) } }] });
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
