// Rend visibles les tests E2E instables : ceux qui n'ont réussi qu'à une nouvelle tentative. `retries: 1` en CI
// (playwright.config.ts) garde le job vert dans ce cas, si bien qu'un test qui rate un essai sur deux ne se voyait nulle part.
//
//   node scripts/e2e-flaky.mjs playwright-results/results.json [--max <n>]
//
// Écrit une annotation GitHub (`::warning`) par test instable, le même détail dans le résumé du job
// (`GITHUB_STEP_SUMMARY`), et ne fait échouer l'étape que si `--max` est donné et dépassé. Un rapport absent
// (le job est tombé avant d'en écrire un) n'est pas une erreur de cette étape.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Les tests dont le statut final est « flaky » (réussis après un échec), suites imbriquées des `describe` comprises. */
export function flakyTests(report) {
  const found = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status === 'flaky') {
          found.push({ file: spec.file, line: spec.line, title: spec.title, project: test.projectName, attempts: (test.results ?? []).length });
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return found;
}

/** Une annotation GitHub par test instable (le fichier est relatif au dossier du front, d'où le préfixe). */
export function annotations(flaky, prefix = 'src/front/InSeconds.Client/e2e/') {
  return flaky.map(
    (test) => `::warning file=${prefix}${test.file},line=${test.line},title=Test E2E instable::${test.title} (${test.project}) : réussi après ${test.attempts - 1} échec(s)`,
  );
}

/** Le résumé du job, en Markdown ; vide quand rien n'est instable. */
export function summary(flaky) {
  if (flaky.length === 0) return '';
  const rows = flaky.map((test) => `| \`${test.file}:${test.line}\` | ${test.title.replaceAll('|', '/')} | ${test.project} | ${test.attempts} |`);
  return [
    `### Tests E2E instables (${flaky.length})`,
    '',
    'Réussis seulement à une nouvelle tentative : le job reste vert, mais le test rate un essai sur un certain nombre.',
    '',
    '| Spec | Test | Projet | Tentatives |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function main(args) {
  const maxIndex = args.indexOf('--max');
  const max = maxIndex >= 0 ? Number(args[maxIndex + 1]) : null;
  const file = args.find((arg, i) => !arg.startsWith('--') && (maxIndex < 0 || i !== maxIndex + 1));
  if (!file || (max !== null && !Number.isInteger(max))) {
    console.error('Usage : node scripts/e2e-flaky.mjs <results.json> [--max <n>]');
    return 64;
  }
  if (!existsSync(file)) {
    console.log(`Pas de rapport (${file}) : rien à signaler.`);
    return 0;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // Un rapport tronqué (job annulé pendant l'écriture) : le vrai échec est ailleurs, cette étape n'en ajoute pas un.
    console.log(`Rapport illisible (${file}) : rien à signaler.`);
    return 0;
  }
  const flaky = flakyTests(report);
  if (flaky.length === 0) {
    console.log('Aucun test instable.');
    return 0;
  }
  for (const line of annotations(flaky)) console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(flaky) + '\n');
  if (max !== null && flaky.length > max) {
    console.error(`${flaky.length} tests instables, plus que le seuil de ${max}.`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
