import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { WIDE_SCREEN, WIDE_SCREEN_QUERY } from './wide-screen';

describe('WIDE_SCREEN', () => {
  it('suit la largeur de l\'écran', () => {
    let listener: ((event: MediaQueryListEvent) => void) | null = null;
    const media = { matches: true, addEventListener: (_: string, l: (event: MediaQueryListEvent) => void) => { listener = l; } };
    const matchMedia = vi.fn(() => media);
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: { matchMedia } } }] });

    const wide = TestBed.inject(WIDE_SCREEN);

    expect(matchMedia).toHaveBeenCalledWith(WIDE_SCREEN_QUERY);
    expect(wide()).toBe(true);
    listener!({ matches: false } as MediaQueryListEvent);
    expect(wide()).toBe(false);
  });

  it('sans matchMedia, l\'écran est étroit', () => {
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: {} } }] });

    expect(TestBed.inject(WIDE_SCREEN)()).toBe(false);
  });
});
