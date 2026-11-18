#!/usr/bin/env node
// Hook PreToolUse (Bash, PowerShell) : un seul processus node par commande shell, qui enchaîne
// les contrôles des autres hooks (chacun exporte `check(input)`) :
//   no-em-dash, protected-branches, commit-identity, puis lint-before-commit (le plus lent,
//   lancé seulement si rien n'est déjà refusé).
// Un contrôle qui plante est ignoré et signalé, les autres tournent quand même.
// Filet PowerShell : si une commande PowerShell parle de commit ou de push à git mais que le
// découpage n'y trouve aucun appel à git (Invoke-Expression, Start-Process, chemin calculé...),
// elle est refusée plutôt que de passer sans contrôle.

import path from 'node:path';
import { check as commitIdentity } from './commit-identity.mjs';
import { gitInvocations, isMain, readHookInput, shellOf, splitPowerShell, writeContext } from './lib/shell.mjs';
import { check as lintBeforeCommit } from './lint-before-commit.mjs';
import { check as noEmDash } from './no-em-dash.mjs';
import { check as protectedBranches } from './protected-branches.mjs';

const CHECKS = [
  ['no-em-dash', noEmDash],
  ['protected-branches', protectedBranches],
  ['commit-identity', commitIdentity],
];

const GIT_WRITE = /\bgit(?:\.exe)?\b[\s\S]*\b(?:commit|push|merge|rebase|cherry-pick|revert|am|pull)\b/i;

function opaquePowerShell(input) {
  const command = input.tool_input?.command;
  if (shellOf(input) !== 'powershell' || typeof command !== 'string') return null;
  // Sur les mots découpés, pour ignorer les commentaires.
  if (!GIT_WRITE.test(splitPowerShell(command).flat().join(' '))) return null;
  if (gitInvocations(command, input.cwd, 'powershell').length) return null;
  return {
    block:
      `Refusé par le hook shell-guard : cette commande PowerShell semble lancer git (commit, push, merge...) ` +
      `sous une forme que les hooks ne savent pas lire. Écrire l'appel en clair (\`git commit ...\`, ` +
      `variables par \`$env:GIT_AUTHOR_NAME='...';\`), ou passer par l'outil Bash.`,
  };
}

export async function check(input) {
  const blocks = [];
  const contexts = [];
  const runOne = async (name, fn) => {
    try {
      const result = await fn(input);
      if (result?.block) blocks.push(result.block);
      if (result?.context) contexts.push(result.context);
    } catch (error) {
      contexts.push(`Hook ${name} en échec, ignoré : ${error?.message ?? error}`);
    }
  };

  for (const [name, fn] of CHECKS) await runOne(name, fn);
  await runOne('shell-guard', opaquePowerShell);
  if (!blocks.length) await runOne('lint-before-commit', lintBeforeCommit);

  return { block: blocks.join('\n\n') || null, context: contexts.join('\n') || null };
}

if (isMain(import.meta.url)) {
  let result;
  try {
    result = await check(readHookInput());
  } catch (error) {
    process.stderr.write(`Hook ${path.basename(process.argv[1])} en échec, ignoré : ${error?.message ?? error}\n`);
    process.exit(0);
  }
  if (result.block) {
    process.stderr.write(`${result.block}\n`);
    process.exit(2);
  }
  if (result.context) writeContext('PreToolUse', result.context);
}
