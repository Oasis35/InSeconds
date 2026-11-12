import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { SetlistBottomBarComponent } from './setlist-bottom-bar.component';

describe('SetlistBottomBarComponent', () => {
  async function render(url: string, state: { v4?: boolean; immersive?: boolean; dailyDone?: boolean | null }) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([{ path: '**', children: [] }])] });
    const chrome = TestBed.inject(ShellChromeStore);
    chrome.setV4(state.v4 ?? true);
    chrome.setImmersive(state.immersive ?? false);
    chrome.setDailyDone(state.dailyDone ?? null);
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(SetlistBottomBarComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, chrome };
  }

  afterEach(() => document.documentElement.classList.remove('has-bottom-bar'));

  it('apparaît sur le jeu du jour sous la V4 et réserve sa place', async () => {
    const { el } = await render('/daily', {});
    expect(el.querySelector('[data-testid="bottom-bar"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="tab-daily"]')?.getAttribute('aria-current')).toBe('page');
    expect(document.documentElement.classList.contains('has-bottom-bar')).toBe(true);
  });

  it('ne montre rien sans la V4', async () => {
    const { el } = await render('/daily', { v4: false });
    expect(el.querySelector('[data-testid="bottom-bar"]')).toBeNull();
    expect(document.documentElement.classList.contains('has-bottom-bar')).toBe(false);
  });

  it('disparaît pendant une manche et hors du jeu', async () => {
    expect((await render('/setlist', { immersive: true })).el.querySelector('[data-testid="bottom-bar"]')).toBeNull();
    TestBed.resetTestingModule();
    expect((await render('/legal', {})).el.querySelector('[data-testid="bottom-bar"]')).toBeNull();
  });

  it("le défi du jour à faire s'agite, pas quand il est joué", async () => {
    const { el, fixture, chrome } = await render('/setlist', { dailyDone: false });
    expect(el.querySelector('[data-testid="daily-pending"]')).not.toBeNull();
    chrome.setDailyDone(true);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="daily-pending"]')).toBeNull();
  });

  it("l'historique a un seul onglet pour ses deux pages, et n'allume pas celui du mode", async () => {
    const { el } = await render('/setlist/history/12', {});
    expect(el.querySelector('[data-testid="tab-history"]')?.getAttribute('aria-current')).toBe('page');
    expect(el.querySelector('[data-testid="tab-history"]')?.getAttribute('href')).toBe('/daily/history');
    expect(el.querySelector('[data-testid="tab-setlist"]')?.getAttribute('aria-current')).toBeNull();
    TestBed.resetTestingModule();
    expect((await render('/daily/history?mois=2026-10', {})).el.querySelector('[data-testid="tab-daily"]')?.getAttribute('aria-current')).toBeNull();
  });
});
