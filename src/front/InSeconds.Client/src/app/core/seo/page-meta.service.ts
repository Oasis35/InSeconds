import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs';

const SITE_ORIGIN = 'https://inseconds.cc';

/** Les seules adresses que Google doit indexer (le jeu du jour, les réponses d'un jour passé, les deux pages légales). */
const INDEXABLE = [/^\/daily$/, /^\/daily\/archive\/\d{4}-\d{2}-\d{2}$/, /^\/legal$/, /^\/privacy$/];

/** Les pages légales ont leur propre titre et description (clés de traduction) ; les autres gardent ceux de `index.html`. */
const TEXT_KEYS: Readonly<Record<string, { title: string; description: string }>> = {
  '/legal': { title: 'legal.title', description: 'legal.metaDescription' },
  '/privacy': { title: 'privacy.title', description: 'privacy.metaDescription' },
};

/** Balises qui portent le titre ou la description : la page, l'aperçu des réseaux (Open Graph) et celui de X. */
const TITLE_SELECTORS = ['property="og:title"', 'name="twitter:title"'];
const DESCRIPTION_SELECTORS = ['name="description"', 'property="og:description"', 'name="twitter:description"'];

/**
 * Dit à Google quelle est l'adresse de chaque page : `index.html` est le même pour toutes les routes, donc sans balise
 * canonique propre à la page Google les prend pour des doublons. Une canonique auto-référencée sans query string
 * (`?utm_source=…`) pour les pages à indexer ; `noindex` (et pas de canonique) pour tout le reste : compte, admin, Platines,
 * page introuvable. Les pages qui ont leur titre et leur description (légales ici, réponses d'un jour passé) les posent par
 * `setPageText`, qui met à jour d'un coup le titre, la description, Open Graph et X ; `resetPageText` revient à ceux du site.
 * Pas de `hreflang` : les deux langues partagent les mêmes adresses (la langue se choisit dans l'appli), il n'y a donc pas
 * d'adresse par langue à déclarer.
 */
@Injectable({ providedIn: 'root' })
export class PageMetaService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);

  private readonly siteTitle = this.title.getTitle();
  /** Contenu d'origine (celui de `index.html`) de chaque balise de description, pour le restaurer tel quel. */
  private readonly siteTags = new Map<string, string>(
    [...TITLE_SELECTORS, ...DESCRIPTION_SELECTORS].flatMap(sel => {
      const content = this.meta.getTag(sel)?.content;
      return content === undefined ? [] : [[sel, content] as [string, string]];
    }),
  );
  private titled = false;

  /** Appelé au démarrage (provideAppInitializer). */
  init(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.apply(e.urlAfterRedirects));
  }

  /** Applique les balises de l'adresse donnée (query string et fragment ignorés). */
  apply(url: string): void {
    const path = normalize(url);
    const indexable = INDEXABLE.some(rule => rule.test(path));

    if (indexable) {
      const canonical = SITE_ORIGIN + path;
      this.setCanonical(canonical);
      this.meta.updateTag({ property: 'og:url', content: canonical });
      this.meta.removeTag('name="robots"');
    } else {
      this.setCanonical(null);
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    }
    this.applyTitle(path);
  }

  private applyTitle(path: string): void {
    const keys = TEXT_KEYS[path];
    if (keys) {
      this.translate.get([keys.title, keys.description]).subscribe(t =>
        this.setPageText(`${t[keys.title]} - InSeconds`, t[keys.description]));
      this.titled = true;
    } else if (this.titled) {
      this.resetPageText();
      this.titled = false;
    }
  }

  /** Titre et description de la page, repris à l'identique par Open Graph et X (l'aperçu d'un lien partagé). */
  setPageText(title: string, description: string): void {
    this.title.setTitle(title);
    for (const sel of TITLE_SELECTORS) this.updateContent(sel, title);
    for (const sel of DESCRIPTION_SELECTORS) this.updateContent(sel, description);
  }

  /** Remet le titre et les descriptions de `index.html`. */
  resetPageText(): void {
    this.title.setTitle(this.siteTitle);
    for (const [sel, content] of this.siteTags) this.updateContent(sel, content);
  }

  private updateContent(selector: string, content: string): void {
    const match = /^(name|property)="(.+)"$/.exec(selector);
    if (match) this.meta.updateTag({ [match[1]]: match[2], content }, selector);
  }

  private setCanonical(href: string | null): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (href === null) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      head.appendChild(link);
    }
    link.href = href;
  }
}

/** Chemin seul, sans query string ni fragment ni slash final ; la racine est le jeu du jour. */
export function normalize(url: string): string {
  let end = url.search(/[?#]/);
  if (end < 0) end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return end === 0 ? '/daily' : url.slice(0, end);
}
