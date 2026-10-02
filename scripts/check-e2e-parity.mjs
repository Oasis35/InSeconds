// E8 (docs/refonte-v2/PLAN.md § 12 ter) : les E2E copiés en v2 ne doivent pas diverger de ceux
// de la v1. Compare les listes `playwright test --list` des deux fronts (fichier › describe › titre,
// sans numéro de ligne). Tout écart doit être justifié dans
// src/v2/front/InSeconds.Client/e2e/parity-exceptions.json (« onlyInV1 » / « onlyInV2 »).
// Vérifie aussi que e2e/disabled-specs.json ne liste que des specs qui existent.
// Prérequis : `npm ci` fait dans les deux fronts. Usage : node scripts/check-e2e-parity.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V1 = join(root, 'src/front/InSeconds.Client');
const V2 = join(root, 'src/v2/front/InSeconds.Client');

const SEPARATOR = ' › ';

// Ligne de --list : `  [chromium] › specs/x.spec.ts:12:5 › Describe › titre`.
function listTests(dir) {
  // CLI Playwright du front lancée par le Node courant : ni shell, ni recherche dans le PATH.
  // --list ne démarre aucun webServer. E2E_INCLUDE_DISABLED : les specs désactivés de la v2 sont
  // listés aussi (sans effet sur la v1).
  const cli = join(dir, 'node_modules/@playwright/test/cli.js');
  const out = execFileSync(process.execPath, [cli, 'test', '--list'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, E2E_INCLUDE_DISABLED: '1' },
  });
  const tests = new Set();
  for (const raw of out.split('\n')) {
    const line = raw.trim();
    const start = line.indexOf(']' + SEPARATOR);
    if (!line.startsWith('[') || start === -1) continue;
    const [file, ...titles] = line.slice(start + 1 + SEPARATOR.length).split(SEPARATOR);
    const name = file.replaceAll('\\', '/').replace('specs/', '').replace(/:\d+:\d+$/, '');
    tests.add([name, ...titles].join(SEPARATOR));
  }
  if (tests.size === 0) throw new Error(`Aucun test listé dans ${dir} :\n${out}`);
  return tests;
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const v1 = listTests(V1);
const v2 = listTests(V2);
const exceptions = readJson(join(V2, 'e2e/parity-exceptions.json'));
const disabled = readJson(join(V2, 'e2e/disabled-specs.json'));

const errors = [];
const diff = (a, b) => [...a].filter((t) => !b.has(t)).sort((x, y) => x.localeCompare(y));

for (const t of diff(v1, v2)) {
  if (!exceptions.onlyInV1?.[t]) errors.push(`absent de la v2 : ${t}`);
}
for (const t of diff(v2, v1)) {
  if (!exceptions.onlyInV2?.[t]) errors.push(`absent de la v1 : ${t}`);
}
for (const { kind, list, other } of [
  { kind: 'onlyInV1', list: v1, other: v2 },
  { kind: 'onlyInV2', list: v2, other: v1 },
]) {
  for (const t of Object.keys(exceptions[kind] ?? {})) {
    if (!list.has(t) || other.has(t)) errors.push(`exception ${kind} sans objet (à retirer) : ${t}`);
  }
}

const specs = new Set(readdirSync(join(V2, 'e2e/specs')));
for (const spec of Object.keys(disabled)) {
  if (!specs.has(spec)) errors.push(`disabled-specs.json cite un spec inexistant : ${spec}`);
}

if (errors.length > 0) {
  for (const e of errors) console.log(`::error::E2E v1/v2 : ${e}`);
  console.log(
    `\n${errors.length} écart(s). Aligner les specs, ou justifier l'écart dans ` +
      'src/v2/front/InSeconds.Client/e2e/parity-exceptions.json.',
  );
  process.exit(1);
}

const disabledCount = [...v2].filter((t) => disabled[t.split(SEPARATOR)[0]] !== undefined).length;
console.log(
  `OK : ${v1.size} E2E v1, ${v2.size} E2E v2, ${Object.keys(exceptions.onlyInV1 ?? {}).length + Object.keys(exceptions.onlyInV2 ?? {}).length} écart(s) justifié(s).`,
);
console.log(`E2E v2 désactivés : ${disabledCount} / ${v2.size} (${Object.keys(disabled).length} specs).`);
