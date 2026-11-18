// Recalcule les poids des specs E2E (scripts/e2e-weights.json, lus par e2e-shard.mjs) à partir des rapports JSON de
// Playwright publiés par la CI (artefacts `playwright-report-<n>`, fichier `results.json` de chaque job) :
//
//   gh run download <run> -p 'playwright-report-*' -D /tmp/e2e-reports
//   node scripts/e2e-weights.mjs /tmp/e2e-reports [autre dossier…]
//
// Poids d'une spec = somme des durées de la première tentative de chacun de ses tests, en secondes, arrondie (une
// nouvelle tentative ne gonfle pas le poids) ; plusieurs runs donnés : la moyenne. Une spec absente des rapports
// garde son poids, une spec qui n'existe plus quitte la table.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEIGHTS_FILE = fileURLToPath(new URL('./e2e-weights.json', import.meta.url));
const SPECS = fileURLToPath(new URL('../e2e/specs/', import.meta.url));

const dirs = process.argv.slice(2);
if (dirs.length === 0 || dirs.some((dir) => !existsSync(dir))) {
  console.error('Usage : node scripts/e2e-weights.mjs <dossier des rapports> [autre dossier…]');
  process.exit(64);
}

function findReports(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findReports(path);
    return name === 'results.json' ? [path] : [];
  });
}

// Une première tentative en échec (délai dépassé compris) ne mesure pas la durée normale de la spec.
const FAILED = new Set(['failed', 'timedOut', 'interrupted']);

// Somme, par fichier de spec, des durées de première tentative (suites imbriquées des `describe` comprises) ; une
// spec dont un test a raté sa première tentative n'est pas mesurée dans ce rapport.
function durationsOf(report) {
  const seconds = new Map();
  const failed = new Set();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const file = basename(spec.file);
      for (const test of spec.tests) {
        const first = (test.results ?? []).find((result) => result.retry === 0);
        if (!first) continue;
        if (FAILED.has(first.status)) failed.add(file);
        seconds.set(file, (seconds.get(file) ?? 0) + first.duration / 1000);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  for (const file of failed) seconds.delete(file);
  return seconds;
}

const reports = dirs.flatMap(findReports);
if (reports.length === 0) {
  console.error('Aucun results.json dans ces dossiers.');
  process.exit(1);
}

// Une spec ne tourne que dans un job par run : chaque mesure d'un fichier vient d'un run différent.
const samples = new Map();
for (const path of reports) {
  for (const [file, seconds] of durationsOf(JSON.parse(readFileSync(path, 'utf8')))) {
    samples.set(file, [...(samples.get(file) ?? []), seconds]);
  }
}

if (samples.size === 0) {
  console.error('Aucune spec réussie à sa première tentative dans ces rapports : poids inchangés.');
  process.exit(1);
}

const previous = JSON.parse(readFileSync(WEIGHTS_FILE, 'utf8')).weights;
const specs = readdirSync(SPECS).filter((file) => file.endsWith('.spec.ts'));
const weights = Object.fromEntries(
  specs
    .map((file) => {
      const measured = samples.get(file);
      const weight = measured
        ? Math.max(1, Math.round(measured.reduce((a, b) => a + b, 0) / measured.length))
        : previous[file];
      return [file, weight];
    })
    .filter(([, weight]) => weight !== undefined)
    .sort(([a, wa], [b, wb]) => wb - wa || a.localeCompare(b)),
);

const runs = Math.max(...[...samples.values()].map((measured) => measured.length));
const day = new Date().toISOString().slice(0, 10);
const source = `Moyenne de ${runs} run(s) de la CI, mesurée le ${day} (première tentative de chaque test). Mise à jour : node scripts/e2e-weights.mjs <dossier des rapports>.`;
writeFileSync(WEIGHTS_FILE, `${JSON.stringify({ source, weights }, null, 2)}\n`);

const unmeasured = specs.filter((file) => !samples.has(file));
console.log(`${Object.keys(weights).length} specs, ${reports.length} rapport(s) lus, ${runs} run(s).`);
if (unmeasured.length > 0) console.log(`Sans mesure (poids gardé, ou 10 s par défaut) : ${unmeasured.join(', ')}`);
