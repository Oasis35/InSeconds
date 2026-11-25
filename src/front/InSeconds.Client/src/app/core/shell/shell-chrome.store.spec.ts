import { TestBed } from '@angular/core/testing';
import { ShellChromeStore } from './shell-chrome.store';

describe('ShellChromeStore', () => {
  it("commence sans accès Survie, hors manche, défi inconnu", () => {
    const store = TestBed.inject(ShellChromeStore);
    expect(store.survie()).toBe(false);
    expect(store.immersive()).toBe(false);
    expect(store.dailyDone()).toBeNull();
  });

  it("garde ce que les pages posent", () => {
    const store = TestBed.inject(ShellChromeStore);
    store.setSurvie(true);
    store.setImmersive(true);
    store.setDailyDone(false);
    expect([store.survie(), store.immersive(), store.dailyDone()]).toEqual([true, true, false]);
  });

  it("sait si l'accès Survie a été lu", () => {
    const store = TestBed.inject(ShellChromeStore);
    expect(store.survieKnown()).toBe(false);
    store.setSurvie(false, false);
    expect(store.survieKnown()).toBe(false);
    store.setSurvie(false);
    expect(store.survieKnown()).toBe(true);
  });
});
