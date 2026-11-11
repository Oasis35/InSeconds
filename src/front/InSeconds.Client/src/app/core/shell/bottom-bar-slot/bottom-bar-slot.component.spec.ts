import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShellChromeStore } from '../shell-chrome.store';
import { ErrorReportingService } from '../../errors/error-reporting.service';
import { BOTTOM_BAR_SLOT } from './bottom-bar-slot';
import { BottomBarSlotComponent } from './bottom-bar-slot.component';

@Component({ selector: 'app-fake-bar', template: '<nav data-testid="fake-bar"></nav>' })
class FakeBar {}

describe('BottomBarSlotComponent', () => {
  it('ne montre rien sans barre fournie', async () => {
    TestBed.inject(ShellChromeStore).setV4(true);
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    TestBed.tick();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).parentElement?.querySelector('nav')).toBeNull();
  });

  it('charge la barre fournie à la demande', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: BOTTOM_BAR_SLOT, useValue: { load: async () => FakeBar } }] });
    TestBed.inject(ShellChromeStore).setV4(true);
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
    expect((fixture.nativeElement as HTMLElement).parentElement?.querySelector('[data-testid="fake-bar"]')).not.toBeNull();
  });

  it('ne charge rien sans la V4', async () => {
    const load = vi.fn(async () => FakeBar);
    TestBed.configureTestingModule({ providers: [{ provide: BOTTOM_BAR_SLOT, useValue: { load } }] });
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    TestBed.tick();
    expect(load).not.toHaveBeenCalled();
  });

  it("une barre qui ne se charge pas est remontée en avertissement", async () => {
    const report = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: BOTTOM_BAR_SLOT, useValue: { load: () => Promise.reject(new Error('réseau')) } },
      { provide: ErrorReportingService, useValue: { report } },
    ] });
    TestBed.inject(ShellChromeStore).setV4(true);
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ level: 'warning' }));
  });
});
