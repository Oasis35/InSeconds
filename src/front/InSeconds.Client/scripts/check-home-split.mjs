// Vérifie que l'accueil du jeu du jour (`/`) n'importe jamais la manche (`/daily`) : la manche, avec le lecteur audio, la forme d'onde et
// l'autocomplétion, est une route à la demande. Sheriff ne voit pas ces fichiers comme deux ensembles : ils sont tous dans `daily` et
// `gameplay`. Seul `gameplay/data-access/shared-audio` (aucune dépendance) est permis côté accueil, pour déverrouiller le son dans le clic ;
// l'import dynamique de `daily-round.routes` (chargement de fond) n'est pas un `from` et reste permis.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../src/app/', import.meta.url));

// Tout le domaine `daily` charge avec l'accueil, sauf la manche et ce qui n'est lu que par elle.
const ROUND_SIDE = [
  'daily/feature/daily/',
  'daily/feature/daily-round.routes.ts',
  'daily/data-access/daily-round.store.ts',
  'daily/feature/leave-game.guard.ts',
];

// Ce qui est réservé à la manche.
const ROUND_ONLY = [
  /daily-round\.store/,
  /daily-round\.routes/,
  /feature\/daily\/daily\.page/,
  /leave-game\.guard/,
  /gameplay\/feature\//,
  /gameplay\/data-access\/(?!shared-audio$|testing\/)/,
];

// Un import ou un export `from`, sur une ou plusieurs lignes.
const IMPORT = /(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gs;

function* filesIn(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) yield* filesIn(join(path, entry));
  } else if (path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.includes(`${sep}testing${sep}`)) yield path;
}

export function violationsIn(source, isRoundOnly = rule => ROUND_ONLY.some(r => r.test(rule))) {
  const found = [];
  for (const match of source.matchAll(IMPORT)) {
    if (isRoundOnly(match[1])) found.push({ line: source.slice(0, match.index).split('\n').length, text: match[0].replace(/\s+/g, ' ') });
  }
  return found;
}

const violations = [];
for (const file of filesIn(join(APP, 'daily'))) {
  const relativePath = relative(APP, file).split(sep).join('/');
  if (ROUND_SIDE.some(part => relativePath.startsWith(part))) continue;
  for (const { line, text } of violationsIn(readFileSync(file, 'utf8'))) violations.push(`src/app/${relativePath}:${line}  ${text}`);
}

if (violations.length > 0) {
  console.error("L'accueil (`/`) ne doit pas importer la manche (`/daily`, chargée à la demande) :");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log("check-home-split : l'accueil n'importe rien de la manche.");
