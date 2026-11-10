import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunTrackEffects } from '../../domain/run-cards';
import { RunRoundCardsComponent } from './run-round-cards.component';

const VALUES = { extendBonusSeconds: 5, rewardMarginPercent: 25 };

const EFFECTS = (overrides: Partial<RunTrackEffects> = {}): RunTrackEffects => ({
  cards: [], year: null, artistInitials: null, titleInitials: null, choices: null, genre: null, ...overrides,
});

describe('RunRoundCardsComponent', () => {
  function render(effects: RunTrackEffects | null = null, refused = false) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunRoundCardsComponent);
    fixture.componentRef.setInput('effects', effects);
    fixture.componentRef.setInput('values', VALUES);
    fixture.componentRef.setInput('listenSeconds', 15);
    fixture.componentRef.setInput('refused', refused);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const texts = (selector: string) => [...element.querySelectorAll(selector)].map(e => e.textContent?.replace(/\s+/g, ' ').trim());
    return { fixture, element, texts };
  }

  it('l\'Indice montre l\'année, les initiales et le genre en puces étiquetées', () => {
    const { texts } = render(EFFECTS({
      cards: ['hint'], year: 1995, artistInitials: ['D', 'P'], titleInitials: ['O', 'M', 'T'], genre: 'Électro',
    }));

    expect(texts('[data-testid="run-hint-fact"]')).toEqual([
      'Année1995', 'Initiales de l’artisteD. P.', 'Initiales du titreO. M. T.', 'GenreÉlectro']);
  });

  it('le QCM dit qu\'une seule réponse est juste, la Prolongation l\'écoute du morceau', () => {
    const { texts } = render(EFFECTS({ cards: ['three_choices', 'extend'] }));

    expect(texts('[data-testid="run-card-effect"]')).toEqual(['Une seule est juste', 'Écoute de 15 s']);
  });

  it('sans carte active, rien ne s\'affiche ; il ne reste là aucun bouton à toucher', () => {
    const { element } = render(EFFECTS());

    expect(element.querySelector('[data-testid="run-round-cards"]')).toBeNull();
    expect(element.querySelector('button')).toBeNull();
  });

  it('un échange refusé le dit', () => {
    const { element } = render(null, true);

    expect(element.querySelector('[data-testid="run-card-refused"]')?.textContent?.trim()).toBe('Ce morceau n\'a pas pu être changé.');
  });
});
