import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunHandCard, RunTrackEffects } from '../../domain/run-cards';
import { RunRoundCardsComponent } from './run-round-cards.component';

const VALUES = { extendListenSeconds: 20, hourglassSeconds: 30, lowerTargetPercent: 25 };

const EFFECTS = (overrides: Partial<RunTrackEffects> = {}): RunTrackEffects => ({
  cards: [], year: null, artistInitials: null, titleInitials: null, choices: null, clockBonusSeconds: 0, ...overrides,
});

describe('RunRoundCardsComponent', () => {
  function render(hand: RunHandCard[], effects: RunTrackEffects | null = null, playable = true) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunRoundCardsComponent);
    fixture.componentRef.setInput('hand', hand);
    fixture.componentRef.setInput('effects', effects);
    fixture.componentRef.setInput('values', VALUES);
    fixture.componentRef.setInput('listenSeconds', 20);
    fixture.componentRef.setInput('playable', playable);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const texts = (selector: string) => [...element.querySelectorAll(selector)].map(e => e.textContent?.replace(/\s+/g, ' ').trim());
    return { fixture, element, texts };
  }

  it('les cartes de la main se jouent d\'un toucher', () => {
    const { fixture, element } = render([{ slot: 1, card: 'year' }, { slot: 3, card: 'joker' }]);
    const played: number[] = [];
    fixture.componentInstance.play.subscribe(slot => played.push(slot));

    element.querySelector<HTMLButtonElement>('[data-testid="run-play-joker"]')!.click();

    expect(played).toEqual([3]);
    expect(element.querySelector('[data-testid="run-play-year"]')?.getAttribute('aria-label')).toBe('Jouer Année');
  });

  it('les cartes jouées montent dans la carte du morceau avec ce qu\'elles révèlent', () => {
    const { texts } = render([], EFFECTS({
      cards: ['year', 'initials', 'net'], year: 1995, artistInitials: ['D', 'P'], titleInitials: ['O', 'M', 'T'],
    }));

    expect(texts('[data-testid="run-card-effect"]')).toEqual(['1995 Année', 'D. P. – O. M. T. Initiales', 'Un raté compte à moitié']);
  });

  it('le Joker ne laisse rien sur le nouveau morceau ; sans carte ni effet, rien ne s\'affiche', () => {
    expect(render([], EFFECTS({ cards: ['joker'] })).element.querySelector('[data-testid="run-round-cards"]')).toBeNull();
  });

  it('Seuil abaissé dit la baisse de la playlist, Rallonge l\'écoute du morceau ; une carte jouée prend toute la largeur', () => {
    const { element, texts } = render([], EFFECTS({ cards: ['lower_target', 'extend'] }));

    expect(texts('[data-testid="run-card-effect"]')).toEqual(['−25 % Objectif de la manche abaissé', 'Écoute de 20 s']);
    expect(element.querySelector('[data-testid="run-card-effect"]')?.className).toContain('col-span-2');
  });

  it('hors de la saisie (réponse en route), les cartes de la main ne se touchent pas', () => {
    const { element } = render([{ slot: 1, card: 'year' }], null, false);

    expect(element.querySelector<HTMLButtonElement>('[data-testid="run-play-year"]')!.disabled).toBe(true);
  });

  it('le Sablier dit le temps ajouté', () => {
    const { texts } = render([], EFFECTS({ cards: ['hourglass'], clockBonusSeconds: 30 }));

    expect(texts('[data-testid="run-card-effect"]')[0]).toMatch(/^\+30\ss au chrono$/u);
  });
});
