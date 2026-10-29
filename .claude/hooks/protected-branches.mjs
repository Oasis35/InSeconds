#!/usr/bin/env node
// Hook PreToolUse (Bash) : jamais de commit ni de push direct sur main ou env/staging.
// Toujours une branche de travail puis une PR (CLAUDE.md racine, § Conventions Git).
// GitHub refuse déjà ces pushes (ruleset) ; le hook arrête Claude avant, avec la marche à suivre.

import { PROTECTED_BRANCHES, block, currentBranch, git, gitInvocations, readHookInput, runSafely } from './lib/shell.mjs';

// Commandes qui créent un commit sur la branche courante (un `git pull` qui met main à jour reste permis :
// un commit de fusion local n'irait de toute façon nulle part, le push étant refusé).
const COMMITTING = new Set(['commit', 'merge', 'revert', 'cherry-pick', 'am']);
const NO_COMMIT_FLAGS = ['--abort', '--quit', '--skip', '--dry-run', '-h', '--help'];
// Options de git push suivies d'une valeur séparée.
const PUSH_OPTIONS_WITH_VALUE = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

const isProtected = (branch) => PROTECTED_BRANCHES.includes(branch.replace(/^refs\/heads\//, ''));

// Branche courante après un `git checkout` / `git switch` vu plus tôt dans la même commande.
function branchAfterSwitch(inv) {
  const args = inv.args;
  if (args.includes('--')) return null;
  const createIndex = args.findIndex((a) => ['-b', '-B', '-c', '-C', '--create', '--force-create', '--orphan'].includes(a));
  if (createIndex >= 0) return args[createIndex + 1] ?? null;
  const target = args.find((a) => !a.startsWith('-'));
  if (!target) return null;
  if (inv.sub === 'switch') return target;
  return git(['rev-parse', '--verify', '-q', `refs/heads/${target}`], inv.cwd) ? target : null;
}

function pushTargets(inv, branch) {
  const positional = [];
  for (let i = 0; i < inv.args.length; i++) {
    const a = inv.args[i];
    if (PUSH_OPTIONS_WITH_VALUE.has(a)) i++;
    else if (!a.startsWith('-')) positional.push(a);
  }
  const refspecs = positional.slice(1);
  if (refspecs.length === 0) {
    if (inv.args.includes('--all') || inv.args.includes('--mirror') || inv.args.includes('--branches')) return PROTECTED_BRANCHES;
    if (inv.args.includes('--tags')) return [];
    return branch ? [branch] : [];
  }
  return refspecs.map((spec) => {
    const destination = spec.replace(/^\+/, '').split(':').pop();
    return destination === 'HEAD' ? branch ?? 'HEAD' : destination;
  });
}

runSafely(() => {
  const input = readHookInput();
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !/\bgit\b/.test(command)) return;

  const problems = [];
  let simulatedBranch = null;
  for (const inv of gitInvocations(command, input.cwd)) {
    const branch = simulatedBranch ?? currentBranch(inv.cwd);
    if (inv.sub === 'checkout' || inv.sub === 'switch') {
      simulatedBranch = branchAfterSwitch(inv) ?? simulatedBranch;
      continue;
    }
    if (inv.sub === 'push') {
      const targets = pushTargets(inv, branch).filter(isProtected);
      if (targets.length) problems.push(`git push vers ${[...new Set(targets)].join(', ')}`);
      continue;
    }
    if (COMMITTING.has(inv.sub) && branch && isProtected(branch) && !inv.args.some((a) => NO_COMMIT_FLAGS.includes(a))) {
      problems.push(`git ${inv.sub} sur la branche ${branch}`);
    }
  }

  if (problems.length) {
    block(
      `Refusé par le hook protected-branches : ${problems.join(' ; ')}.\n` +
        `Jamais de commit ni de push direct sur ${PROTECTED_BRANCHES.join(' ou ')}. ` +
        `Créer une branche de travail (\`git checkout -b feat/<sujet>\`, ou la branche imposée par la session), ` +
        `y committer, la pousser, puis ouvrir une PR vers env/staging (cf. CLAUDE.md, § Conventions Git).`,
    );
  }
});
