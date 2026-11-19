#!/usr/bin/env node
// Hook SessionStart : dit à Claude sur quelle branche il démarre, l'alerte s'il est sur main ou
// env/staging, et confirme que les hooks du dépôt se déclenchent. En session cloud, où ce n'est
// pas garanti, l'absence de la ligne « [hooks InSeconds actifs] » veut dire que les règles portées
// par les hooks sont à appliquer à la main. Ne bloque rien.

import { PROTECTED_BRANCHES, currentBranch, git, readHookInput, runSafely, writeContext } from './lib/shell.mjs';

const HOOKS = 'shell-guard (protected-branches, commit-identity, no-em-dash, lint-before-commit), no-em-dash, grafana-reminder, codegen-reminder';

export function message(cwd) {
  const branch = currentBranch(cwd) || git(['rev-parse', '--short', 'HEAD'], cwd) || '(inconnue)';
  const lines = [`[hooks InSeconds actifs] ${HOOKS}.`, `Branche courante : ${branch}.`];
  const onProtected = PROTECTED_BRANCHES.includes(branch);
  if (onProtected) {
    lines.push(
      `ATTENTION : ${branch} est protégée. Créer une branche de travail avant toute modification ` +
        `(\`git fetch origin && git checkout -b feat/<sujet> origin/env/staging\`).`,
    );
  }
  return { text: lines.join('\n'), onProtected, branch };
}

runSafely(() => {
  const input = readHookInput();
  const { text, onProtected, branch } = message(input.cwd || process.cwd());
  writeContext('SessionStart', text, onProtected ? { systemMessage: `Session ouverte sur la branche protégée ${branch}.` } : {});
});
