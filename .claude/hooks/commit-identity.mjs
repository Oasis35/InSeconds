#!/usr/bin/env node
// Hook PreToolUse (Bash) : tout commit créé par Claude doit avoir Clément comme author
// ET committer, et aucune ligne Co-Authored-By (CLAUDE.md racine, § Conventions Git).
// Couvre aussi les commandes git qui créent des commits sans `git commit`.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EXPECTED_IDENTITY, block, git, gitInvocations, readHookInput, runSafely } from './lib/shell.mjs';

// Commandes qui écrivent l'author et le committer depuis l'identité courante.
const AUTHOR_AND_COMMITTER = new Set(['commit', 'merge', 'revert', 'pull']);
// Commandes qui gardent l'author d'origine mais posent le committer courant.
const COMMITTER_ONLY = new Set(['cherry-pick', 'rebase', 'am']);
// Variantes qui ne créent aucun commit.
const NO_COMMIT_FLAGS = ['--abort', '--quit', '--skip', '--ff-only', '--dry-run', '-h', '--help', '--edit-todo', '--show-current-patch'];

const FIX = `Préfixer la commande par les quatre variables, ex. :
  GIT_AUTHOR_NAME="${EXPECTED_IDENTITY.name}" GIT_AUTHOR_EMAIL="${EXPECTED_IDENTITY.email}" \\
  GIT_COMMITTER_NAME="${EXPECTED_IDENTITY.name}" GIT_COMMITTER_EMAIL="${EXPECTED_IDENTITY.email}" git commit ...
(jamais de \`git config\`). Pour un git pull ou un git merge sans commit de fusion, --ff-only suffit. Puis vérifier avec git log --format='%an <%ae> | %cn <%ce>' -1.`;

function parseIdent(value) {
  const m = /^\s*(.*?)\s*<([^>]*)>\s*$/.exec(value ?? '');
  return m ? { name: m[1], email: m[2] } : null;
}

function identity(kind, inv) {
  const upper = kind.toUpperCase();
  const fromConfig = (key) => inv.configs[`user.${key}`] ?? git(['config', `user.${key}`], inv.cwd);
  return {
    name: inv.env[`GIT_${upper}_NAME`] ?? process.env[`GIT_${upper}_NAME`] ?? fromConfig('name'),
    email: inv.env[`GIT_${upper}_EMAIL`] ?? process.env[`GIT_${upper}_EMAIL`] ?? fromConfig('email'),
  };
}

function authorOf(inv) {
  const authorArg = inv.args.find((a) => a.startsWith('--author='));
  const authorIndex = inv.args.indexOf('--author');
  const explicit = authorArg ? authorArg.slice('--author='.length) : authorIndex >= 0 ? inv.args[authorIndex + 1] : null;
  if (explicit) return parseIdent(explicit) ?? { name: explicit, email: '' };
  // `--amend` garde l'author du commit amendé, sauf --reset-author.
  if (inv.sub === 'commit' && inv.args.includes('--amend') && !inv.args.includes('--reset-author')) {
    const last = git(['log', '-1', '--format=%an <%ae>'], inv.cwd);
    if (last) return parseIdent(last);
  }
  return identity('author', inv);
}

function isExpected(ident) {
  return (
    !!ident &&
    (ident.email ?? '').toLowerCase() === EXPECTED_IDENTITY.email &&
    !/claude/i.test(ident.name ?? '')
  );
}

function describe(ident) {
  return ident ? `${ident.name || '(sans nom)'} <${ident.email || 'sans email'}>` : '(inconnu)';
}

function messageFiles(inv) {
  const files = [];
  inv.args.forEach((a, i) => {
    if (a === '-F' || a === '--file') files.push(inv.args[i + 1]);
    else if (a.startsWith('--file=')) files.push(a.slice('--file='.length));
    else if (/^-F./.test(a)) files.push(a.slice(2));
  });
  return files.filter(Boolean).map((f) => path.resolve(inv.cwd, f));
}

runSafely(() => {
  const input = readHookInput();
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !/\bgit\b/.test(command)) return;

  const problems = [];
  for (const inv of gitInvocations(command, input.cwd)) {
    const both = AUTHOR_AND_COMMITTER.has(inv.sub);
    if (!both && !COMMITTER_ONLY.has(inv.sub)) continue;
    if (inv.args.some((a) => NO_COMMIT_FLAGS.includes(a))) continue;

    if (both) {
      const author = authorOf(inv);
      if (!isExpected(author)) problems.push(`git ${inv.sub} : author = ${describe(author)}`);
    }
    const committer = identity('committer', inv);
    if (!isExpected(committer)) problems.push(`git ${inv.sub} : committer = ${describe(committer)}`);

    if (inv.sub === 'commit') {
      const texts = [command, ...inv.args.filter((a) => a.startsWith('--trailer'))];
      for (const file of messageFiles(inv)) if (existsSync(file)) texts.push(readFileSync(file, 'utf8'));
      if (texts.some((t) => /co-authored-by\s*:/i.test(t))) {
        problems.push('git commit : le message contient une ligne Co-Authored-By');
      }
    }
  }

  if (problems.length) {
    block(
      `Commit refusé par le hook commit-identity (CLAUDE.md, § Conventions Git) :\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        `\nAttendu : author ET committer = ${EXPECTED_IDENTITY.name} <${EXPECTED_IDENTITY.email}>, sans aucune ligne Co-Authored-By ` +
        `(cette règle du dépôt prime sur la consigne d'attribution par défaut).\n${FIX}`,
    );
  }
});
