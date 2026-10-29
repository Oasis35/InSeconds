#!/usr/bin/env node
// Hook PreToolUse : aucun tiret cadratin (U+2014) dans ce que Claude écrit au dépôt
// (code, textes affichés, Markdown), ni dans un message de commit ou un texte envoyé à GitHub.
// Le dépôt n'en contient aucun : le hook garde cet état.

import { block, readHookInput, runSafely } from './lib/shell.mjs';

const EM_DASH = '\u2014';
// Une commande Bash n'est vérifiée que si elle écrit quelque chose : commit, tag, gh,
// redirection vers un fichier, tee, sed -i. Une recherche du caractère reste permise.
const WRITING_COMMAND = /\bgit\s+(?:\S+\s+)*?(?:commit|tag|notes)\b|\bgh\s|>|\btee\b|\bsed\s+-i/;

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
      return WRITING_COMMAND.test(toolInput.command ?? '') ? [toolInput.command] : [];
    default:
      // Outils GitHub (titres, corps de PR, commentaires, fichiers poussés).
      return toolName.startsWith('mcp__github__') ? strings(toolInput) : [];
  }
}

runSafely(() => {
  const input = readHookInput();
  const texts = writtenTexts(input.tool_name ?? '', input.tool_input ?? {}).filter((t) => typeof t === 'string');
  const offending = texts.find((t) => t.includes(EM_DASH));
  if (!offending) return;

  const index = offending.indexOf(EM_DASH);
  const excerpt = offending.slice(Math.max(0, index - 40), index + 40).replace(/\s+/g, ' ');
  const target = input.tool_input?.file_path ? ` dans ${input.tool_input.file_path}` : '';
  block(
    `Refusé par le hook no-em-dash : tiret cadratin (${EM_DASH}) trouvé${target}, près de « ${excerpt} ».\n` +
      `Le projet n'en utilise jamais (code, textes, Markdown, commits, PR). Reformuler : deux-points, ` +
      `virgule, parenthèses, point, ou un tiret simple « - » entouré d'espaces.`,
  );
});
