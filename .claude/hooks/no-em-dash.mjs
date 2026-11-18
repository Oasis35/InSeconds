#!/usr/bin/env node
// Hook PreToolUse : aucun tiret cadratin (U+2014) dans ce que Claude écrit au dépôt
// (code, textes affichés, Markdown), ni dans un message de commit ou un texte envoyé à GitHub.
// Le dépôt n'en contient aucun : le hook garde cet état.
// Branché seul sur Write, Edit, MultiEdit, NotebookEdit et les outils GitHub ; pour Bash et
// PowerShell, c'est shell-guard.mjs qui l'appelle.

import { isMain, runCheck } from './lib/shell.mjs';

const EM_DASH = String.fromCharCode(0x2014);

// Une commande shell n'est vérifiée que si elle écrit quelque chose : commit, tag, notes, gh,
// tee, sed -i, cmdlets d'écriture PowerShell, ou une vraie redirection vers un fichier.
// Une recherche du caractère reste permise.
const WRITING_COMMAND = /\bgit\s+(?:\S+\s+)*?(?:commit|tag|notes)\b|\bgh\s|\btee\b|\bsed\s+-i|\b(?:Out-File|Set-Content|Add-Content|New-Item)\b/i;

// Redirection de la sortie standard vers un fichier : `>`, `>>`, `1>`, mais ni `2>` (erreurs),
// ni `->` / `=>` (flèches), ni `>&` (vers un descripteur), ni `/dev/null`, `$null` ou `NUL`.
const FILE_REDIRECT = /(?:^|[^-=<>&0-9])1?>>?(?!&)\s*(?!(?:\/dev\/null|\$null|nul)(?![\w./\\-]))[^\s&|;<>]/i;

export function writesFile(command) {
  return WRITING_COMMAND.test(command) || FILE_REDIRECT.test(command);
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function writtenTexts(toolName, toolInput) {
  switch (toolName) {
    case 'Write':
      return [toolInput.content];
    case 'Edit':
      return [toolInput.new_string];
    case 'MultiEdit':
      return (toolInput.edits ?? []).map((e) => e.new_string);
    case 'NotebookEdit':
      return [toolInput.new_source];
    case 'Bash':
    case 'PowerShell':
      return writesFile(toolInput.command ?? '') ? [toolInput.command] : [];
    default:
      // Outils GitHub (titres, corps de PR, commentaires, fichiers poussés).
      return toolName.startsWith('mcp__github__') ? strings(toolInput) : [];
  }
}

export function check(input) {
  const texts = writtenTexts(input.tool_name ?? '', input.tool_input ?? {}).filter((t) => typeof t === 'string');
  const offending = texts.find((t) => t.includes(EM_DASH));
  if (!offending) return null;

  const index = offending.indexOf(EM_DASH);
  const excerpt = offending.slice(Math.max(0, index - 40), index + 40).replace(/\s+/g, ' ');
  const target = input.tool_input?.file_path ? ` dans ${input.tool_input.file_path}` : '';
  return {
    block:
      `Refusé par le hook no-em-dash : tiret cadratin (${EM_DASH}) trouvé${target}, près de « ${excerpt} ».\n` +
      `Le projet n'en utilise jamais (code, textes, Markdown, commits, PR). Reformuler : deux-points, ` +
      `virgule, parenthèses, point, ou un tiret simple « - » entouré d'espaces.`,
  };
}

if (isMain(import.meta.url)) await runCheck(check, 'PreToolUse');
