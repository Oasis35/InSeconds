import { TestBed } from '@angular/core/testing';
import { ShellChromeStore } from './shell-chrome.store';

describe('ShellChromeStore', () => {
  it('commence sans V4, hors manche, défi inconnu', () => {
    const store = TestBed.inject(ShellChromeStore);
    expect(store.v4()).toBe(false);
    expect(store.immersive()).toBe(false);
    expect(store.dailyDone()).toBeNull();
  });

  it("garde ce que les pages posent", () => {
    const store = TestBed.inject(ShellChromeStore);
    store.setV4(true);
    store.setImmersive(true);
    store.setDailyDone(false);
    expect([store.v4(), store.immersive(), store.dailyDone()]).toEqual([true, true, false]);
  });

  it("sait si le flag de la V4 a été lu", () => {
    const store = TestBed.inject(ShellChromeStore);
    expect(store.v4Known()).toBe(false);
    store.setV4(false, false);
    expect(store.v4Known()).toBe(false);
    store.setV4(false);
    expect(store.v4Known()).toBe(true);
  });
});
