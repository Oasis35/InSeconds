import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * Décor DA "IN//SECONDS" : grille perspective + scanlines animées.
 * À poser en premier enfant d'un conteneur `position:relative` (ou `fixed`)
 * portant la classe `.da-bg` (fond dégradé violet, cf. styles.scss).
 */
@Component({
  selector: 'app-decor-background',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './decor-background.component.html',
})
export class DecorBackgroundComponent {}
