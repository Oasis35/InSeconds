// E8 (docs/refonte-v2/PLAN.md § 12 ter) : les E2E copiés en v2 ne doivent pas diverger de ceux
// de la v1. Compare les listes `playwright test --list` des deux fronts (fichier › describe › titre,
// sans numéro de ligne). Tout écart doit être justifié dans
// src/v2/front/InSeconds.Client/e2e/parity-exceptions.json (« onlyInV1 » / « onlyInV2 »).
// Vérifie aussi que e2e/disabled-specs.json ne liste que des specs qui existent.
// Prérequis : `npm ci` fait dans les deux fronts. Usage : node scripts/check-e2e-parity.mjs
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V1 = join(root, 'src/front/InSeconds.Client');
const V2 = join(root, 'src/v2/front/InSeconds.Client');

// Ligne de --list : `  [chromium] › specs/x.spec.ts:12:5 › Describe › titre`.
function listTests(dir) {
  // --list ne démarre aucun webServer. E2E_INCLUDE_DISABLED : les specs désactivés de la v2 sont
  // listés aussi (sans effet sur la v1). Commande fixe : le shell Windows n'est jamais exposé à une entrée.
  const out = execSync('npx --no-install playwright test --list', {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, E2E_INCLUDE_DISABLED: '1' },
  });
  const tests = new Set();
  for (const line of out.split(/\r?\n/)) {
    const match = line.match(/^\s*\[[^\]]+\]\s+›\s+(.+)$/);
    if (!match) continue;
    const [file, ...titles] = match[1].split(' › ');
    const name = file.replaceAll('\\', '/').replace(/^specs\//, '').replace(/:\d+:\d+$/, '');
    tests.add([name, ...titles].join(' › '));
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
const diff = (a, b) => [...a].filter((t) => !b.has(t)).sort();

for (const t of diff(v1, v2)) {
  if (!exceptions.onlyInV1?.[t]) errors.push(`absent de la v2 : ${t}`);
}
for (const t of diff(v2, v1)) {
  if (!exceptions.onlyInV2?.[t]) errors.push(`absent de la v1 : ${t}`);
}
for (const [kind, list, other] of [
  ['onlyInV1', v1, v2],
  ['onlyInV2', v2, v1],
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

const disabledCount = [...v2].filter((t) => disabled[t.split(' › ')[0]] !== undefined).length;
console.log(
  `OK : ${v1.size} E2E v1, ${v2.size} E2E v2, ${Object.keys(exceptions.onlyInV1 ?? {}).length + Object.keys(exceptions.onlyInV2 ?? {}).length} écart(s) justifié(s).`,
);
console.log(`E2E v2 désactivés : ${disabledCount} / ${v2.size} (${Object.keys(disabled).length} specs).`);
