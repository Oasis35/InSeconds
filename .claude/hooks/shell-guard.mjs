#!/usr/bin/env node
// Hook PreToolUse (Bash, PowerShell) : un seul processus node par commande shell, qui enchaîne
// les contrôles des autres hooks (chacun exporte `check(input)`) :
//   no-em-dash, protected-branches, commit-identity, puis lint-before-commit (le plus lent,
//   lancé seulement si rien n'est déjà refusé).
// Chaque contrôle est chargé à part (import dynamique) : un module qui plante au chargement ou à
// l'appel est ignoré et signalé, les autres tournent quand même.
// Filet PowerShell : une commande PowerShell qui parle de commit ou de push à git est refusée
// quand les hooks ne peuvent pas la lire : aucun appel à git trouvé, un exécuteur opaque
// (Invoke-Expression, Start-Process, `& $variable`...), un splatting (`git @args`), ou une
// variable d'identité GIT_AUTHOR_* / GIT_COMMITTER_* posée autrement que par `$env:NOM = '...'`.

import path from 'node:path';
import { gitInvocations, isMain, psEnvAssignment, readHookInput, shellOf, splitPowerShell, writeContext } from './lib/shell.mjs';

const CHECKS = [
  ['no-em-dash', './no-em-dash.mjs'],
  ['protected-branches', './protected-branches.mjs'],
  ['commit-identity', './commit-identity.mjs'],
];

const GIT_WRITE = /\bgit(?:\.exe)?\b[\s\S]*\b(?:commit|push|merge|rebase|cherry-pick|revert|am|pull)\b/i;
// Ce qui lance une commande que le découpage ne voit pas.
const OPAQUE_RUNNER =
  /^(?:invoke-expression|iex|start-process|saps|start|invoke-command|icm|start-job|sajb|powershell(?:\.exe)?|pwsh(?:\.exe)?|cmd(?:\.exe)?|bash(?:\.exe)?|sh|wsl(?:\.exe)?|\.)$/i;
const IDENTITY_VAR = /GIT_(?:AUTHOR|COMMITTER)_(?:NAME|EMAIL|DATE)/i;
const IS_GIT = (word) => /^(?:git|git\.exe)$/i.test(path.basename((word ?? '').replaceAll('\\', '/')));

function unreadable(commands) {
  for (const words of commands) {
    const first = words[0] ?? '';
    const callsVariable = first.startsWith('$') && !first.includes('=') && !/^[-+*/]?=/.test(words[1] ?? '');
    if (OPAQUE_RUNNER.test(first) || callsVariable) {
      if (!psEnvAssignment(words)) return `exécuteur opaque (${first})`;
    }
    if (words.some((w) => IDENTITY_VAR.test(w)) && !IS_GIT(first) && !psEnvAssignment(words) && !/^(?:remove-item|ri|rm|del)$/i.test(first)) {
      return `variable d'identité posée sous une forme non lue (${first})`;
    }
  }
  return null;
}

function opaqueReason(command, commands, cwd) {
  // Sur les mots découpés, pour ignorer les commentaires.
  if (!GIT_WRITE.test(commands.flat().join(' '))) return null;
  return gitInvocations(command, cwd, 'powershell').length ? unreadable(commands) : 'aucun appel à git lisible';
}

function opaquePowerShell(input) {
  const command = input.tool_input?.command;
  if (shellOf(input) !== 'powershell' || typeof command !== 'string') return null;
  const commands = splitPowerShell(command);
  // Le splatting cache les arguments, sous-commande comprise : refusé même sans mot de commit visible.
  const splat = commands.some((words) => IS_GIT(words[0]) && words.some((w) => /^@[A-Za-z_]/.test(w)));
  const reason = splat ? 'splatting sur git (git @args)' : opaqueReason(command, commands, input.cwd);
  if (!reason) return null;
  return {
    block:
      `Refusé par le hook shell-guard : cette commande PowerShell semble lancer git (commit, push, merge...) ` +
      `sous une forme que les hooks ne savent pas lire (${reason}). Écrire l'appel en clair (\`git commit ...\`, ` +
      `variables par \`$env:GIT_AUTHOR_NAME='...';\`), ou passer par l'outil Bash.`,
  };
}

export async function check(input, checks = CHECKS) {
  const blocks = [];
  const contexts = [];
  const runOne = async (name, load) => {
    try {
      const fn = await load();
      const result = await fn(input);
      if (result?.block) blocks.push(result.block);
      if (result?.context) contexts.push(result.context);
    } catch (error) {
      contexts.push(`Hook ${name} en échec, ignoré : ${error?.message ?? error}`);
    }
  };
  const fromModule = (file) => async () => (await import(new URL(file, import.meta.url))).check;

  for (const [name, file] of checks) await runOne(name, fromModule(file));
  await runOne('shell-guard', async () => opaquePowerShell);
  if (!blocks.length) await runOne('lint-before-commit', fromModule('./lint-before-commit.mjs'));

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
