---
paths:
  - "src/front/**/*.html"
  - "src/front/**/*.scss"
  - "src/front/**/ui/**"
  - "src/front/**/feature/**"
---
# Direction artistique du front

Tokens dans `:root` de `src/front/InSeconds.Client/src/styles.scss`. Jamais de hex dans un gabarit : `var(--…)`, survols par `hover:` de Tailwind. Le sous-agent `gardien-da` relit tout écran ou style touché.

## Fond et surfaces

- Fond bleu nuit violacé sombre (`--rgb-bg`, `--bg-page`) sous une grille synthwave discrète (environ 14 % d'intensité, un halo à peine marqué ; `ui/decor-background`, classes `.da-bg`, `.da-grid`).
- Tuiles et cartes en bleu nuit profond translucide (`--bg-surface`, 68 % de `--rgb-surface` ; `--bg-surface-2` / `--rgb-panel` opaques), filet plat bleuté `--border-medium`.
- **Le flou est le seul effet de verre permis** (flou seul, sans lueur ni reflet) : 20 px (`--blur-tile`) sur tout ce qui prend `--bg-surface` et sur les barres fixes du bas (`--bg-bar`). La grille passe derrière en tache floue au lieu de traverser le texte ; ne pas le remplacer par un fond plus opaque. Le flou est posé par un sélecteur d'attribut (`[style*="--bg-surface)"]`, `[class*="--bg-surface)"]`) : écrire le fond `background:var(--bg-surface)` pour qu'il s'applique. Sans `backdrop-filter` ou en « moins de transparence », `styles.scss` rend déjà les fonds presque opaques.
- Le bandeau IN//SECONDS des pages (`ui/brand`, `BrandComponent`) est transparent et non collant : seul élément posé sur la grille sans flou.

## Néon : une tuile de focus par écran

- Un tube = un cœur clair (`--core-orange`, `--core-cyan`) en filet et un halo serré de 4 à 12 px. Permis seulement sur : les ondes du lecteur et de la réponse (`--tube-wave-off`, `--tube-wave-lit`), l'onglet actif de la barre du bas, les barres « // » du logo (`.brand-slash`), le compte à rebours, et **une seule tuile de focus par écran**.
- La tuile de focus prend la classe `tube-amber` (ou le cadre cyan du lecteur, `--tube-frame`) : le cadre du lecteur, la carte du défi, la carte Survie quand c'est la prochaine action, la carte du niveau de fin. Jamais de lueur ailleurs. Le tube de la tuile et le halo du bouton plein s'ajoutent.
- Un écran de fin n'a qu'une tuile pleine. Quand la bande du défi du jour monte en tête de la fin de Survie (`dailyFirst`), elle devient la tuile de focus et plus aucun bouton n'est plein.

## Une couleur = un sens

- **Ambre** (`--rgb-accent-3`, `--color-accent-3`, une seule famille : plein, contour ou texte) : le joueur et ce qu'il fait (son score, sa ligne dans un classement, le bouton principal, la série).
- **Cyan** (`--rgb-accent-2`) : le son et le temps (lecteur, extrait, chrono, compte à rebours), plus le gel (`--fill-ice`) et la grille.
- **Violet** (`--rgb-violet`, `--avatar-1` à `--avatar-4`) : les autres joueurs (histogrammes, égaliseur, médiane, classement).
- **Vert / rouge** (`--color-success`, `--color-fail`) : juste ou faux.
- Une action sans sens propre (indices, « Connexion » de l'en-tête, « Créer un compte », « Abandonner », toasts de série) est en contour neutre (`--border-neutral`). **« Passer »** est un lien souligné discret sous « Valider » (`--text-light`, `data-testid="round-skip"`), le même dans tous les modes, porté par `TrackRoundComponent`.
- Disques de niveau : `--disc-*`, seulement pour un disque.

## Boutons et formes

- Tout bouton d'action passe par `<button appButton variant=… size=…>` (`ui/button`) : `primary` (ambre uni `--fill-primary`, texte `--text-on-orange` à environ 8:1, filet `--core-orange`, un seul halo serré `--glow-primary` de 8 px, **sans dégradé** ; un bouton plein par écran, seul à briller), `accent` (contour ambre sans fond), `neutral` (contour `--border-neutral`), `secondary`, `danger`, `ghost` ; `lg` 60 px pour le bouton principal d'un écran, `md` 48 px par défaut, `sm`.
- L'ambre est vif (#FF9500) : ne pas l'éclaircir, il virerait au pastel. Jamais de texte blanc sur l'ambre (2,4:1).
- Boutons en rectangle (`rounded-(--radius-button)`, 10 px), jamais `rounded-full` ni `rounded-2xl` sur un bouton, sauf les ronds voulus : commandes du lecteur (↺, « ▶ X s », dans le même ambre) et accès de l'en-tête (ronds gris à contour `--border-neutral`, sans fond ni lueur).
- Cartes aux coins réguliers (`--radius-card`, 16 px), pochettes rondes.
- Capitales réservées au logo et aux boutons (le bouton principal les garde) ; étiquettes et titres en casse normale.
- Chiffres du résultat : score en `--font-score`, compte à rebours en `--font-clock`.

## Champs, modales, mobile

- Mobile first : tout écran se pense d'abord pour un téléphone, puis s'élargit (`lg`, 1024 px, pour l'admin).
- Champs : classe `.app-input`, filet clair `--border-field`, jamais de halo. Sur écran tactile, 16 px au moins (règle `@media (pointer: coarse)` de `styles.scss`, hors couche donc devant `text-sm`) : sous 16 px, Safari sur iPhone zoome au toucher et garde le zoom. E2E `mobile-input-zoom.spec.ts`.
- Pas de zoom au double tap : `touch-action: manipulation` sur `html` (le pincement reste permis). Un conteneur défilant (`overflow: auto` ou `scroll`) côté jeu reprend `touch-manipulation`, Safari y repartant de zéro.
- Une fenêtre plus haute que l'écran défile dans son conteneur (`max-height: calc(100dvh - 2rem)` sur `.app-modal-panel` et `.app-sheet-panel`). Jamais de modale maison : `ModalService` (`open`, `openSheet`, `confirm`).
- Sous la barre du bas, `html.has-bottom-bar` réserve sa hauteur : rien ne doit passer dessous.

## Durées et nombres

- Jamais une durée écrite à la main (`{{ x }}s`) : pipe `appSeconds` ou `formatSeconds` (`ui/format/`), « 0,5 s » en français. Rangs par `formatOrdinal` (« 2e », « 2nd »).

## Animations

- GSAP passe **uniquement** par la façade `ui/motion/motion.ts`, seul fichier qui importe `gsap` (`enterRow`, `settleLine`, `fillBarsInTurn`, `enterHomeCard`, `lightLadder`, `finishSequence`, `pop`…). Une animation nouvelle s'y ajoute.
- Entrées courtes et amorties, sans rebond ni lueur ; rien en mouvement réduit (`motionReduced()`).
- `clearProps` limité aux propriétés animées, **jamais `clearProps: 'all'`** : il effacerait les styles posés par Angular.
- Éléments ciblés par `data-motion="…"`. Les animations CSS (`.screen-enter`, `.toast-enter`, `[data-anim]`) tombent en fondu en mouvement réduit et s'arrêtent sous `.no-anim` (E2E).

## Ce qui fait « généré par IA » (à éviter)

Dégradés arc-en-ciel, lueurs partout, emojis décoratifs dans les titres, confettis, cartes empilées toutes identiques (icône, titre, phrase), texte creux (« Découvre », « Plonge », « Prêt à relever le défi ? »), badges ou pastilles sans information, tiret cadratin, capitales dans les titres. Un texte court, direct, tutoyé, qui dit quelque chose de précis. Ce fichier est la référence ; `.claude/agents/gardien-da.md` en est le résumé.
