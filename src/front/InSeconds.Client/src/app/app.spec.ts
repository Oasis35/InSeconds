import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  describe('flag E2E __disableAnimations', () => {
    type TestWindow = Window & { __disableAnimations?: boolean };

    afterEach(() => {
      delete (window as TestWindow).__disableAnimations;
      document.documentElement.classList.remove('no-anim');
    });

    it('pose la classe no-anim quand le flag est actif', () => {
      (window as TestWindow).__disableAnimations = true;
      TestBed.createComponent(App);
      expect(document.documentElement.classList.contains('no-anim')).toBeTrue();
    });

    it('ne pose pas la classe no-anim sans le flag', () => {
      TestBed.createComponent(App);
      expect(document.documentElement.classList.contains('no-anim')).toBeFalse();
    });
  });

});
