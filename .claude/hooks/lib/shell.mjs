// Outils partagés des hooks : lecture de l'entrée JSON, découpage approximatif d'une
// commande shell (bash ou PowerShell) en commandes simples, repérage des appels à git.
// Le découpage n'est pas un vrai interpréteur : il vise les formes que Claude écrit
// (variables en préfixe, `export`, `$env:X='…'; git …`, `cd x && git ...`, heredocs et
// here-strings, guillemets, `$(...)`).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROTECTED_BRANCHES = ['main', 'env/staging'];

export const EXPECTED_IDENTITY = { name: 'Clément', email: 'clement.rageau@gmail.com' };

// Outils dont l'entrée `command` est une commande shell, et leur syntaxe.
export const SHELL_TOOLS = { Bash: 'bash', PowerShell: 'powershell' };

export function shellOf(input) {
  return SHELL_TOOLS[input?.tool_name] ?? 'bash';
}

export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

// Refus d'un PreToolUse : code 2, le message part sur stderr et Claude le lit.
export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

// Un hook qui plante ne doit jamais bloquer le travail : on laisse passer en le signalant.
export function runSafely(main) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Hook ${path.basename(process.argv[1] ?? '')} en échec, ignoré : ${error?.message ?? error}\n`);
    process.exit(0);
  }
}

// Vrai quand le module est le script lancé (node x.mjs), faux quand il est importé.
export function isMain(moduleUrl) {
  return !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === moduleUrl;
}

// Lance une vérification `check(input)` comme hook autonome. Elle rend `{ block, context }` :
// `block` refuse l'appel (code 2), `context` est ajouté au contexte de Claude.
export async function runCheck(check, eventName) {
  let result;
  try {
    result = await check(readHookInput());
  } catch (error) {
    process.stderr.write(`Hook ${path.basename(process.argv[1] ?? '')} en échec, ignoré : ${error?.message ?? error}\n`);
    process.exit(0);
  }
  if (result?.block) block(result.block);
  if (result?.context) writeContext(eventName, result.context);
}

export function writeContext(eventName, additionalContext, extra = {}) {
  process.stdout.write(JSON.stringify({ ...extra, hookSpecificOutput: { hookEventName: eventName, additionalContext } }));
}

export function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Sous Windows, Git Bash écrit les chemins `/c/Git/...` : node les lit `C:/Git/...`.
function resolvePath(base, target) {
  let t = target.replace(/^~(?=[\\/]|$)/, process.env.HOME ?? process.env.USERPROFILE ?? '~');
  if (process.platform === 'win32') t = t.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
  return path.resolve(base, t);
}

// Retire le corps des heredocs (<<EOF ... EOF) pour que le texte d'un message de commit
// ne soit pas lu comme des commandes.
export function stripHeredocs(command) {
  const lines = command.split('\n');
  const out = [];
  let delimiter = null;
  for (const line of lines) {
    if (delimiter !== null) {
      if (line.trim() === delimiter) {
        out.push(line.replace(delimiter, ''));
        delimiter = null;
      }
      continue;
    }
    out.push(line);
    const match = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (match) delimiter = match[2];
  }
  return out.join('\n');
}

// Saute une substitution `$(...)` à partir de l'index de `(` ; rend l'index après `)`.
function skipSubstitution(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return text.length;
}

// Accumulateur commun aux deux découpages : des mots, regroupés en commandes.
function commandBuilder() {
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  return {
    add(text) {
      word += text;
      inWord = true;
    },
    endWord() {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
    },
    endCommand() {
      this.endWord();
      if (words.length) commands.push(words);
      words = [];
    },
    done() {
      this.endCommand();
      return commands;
    },
  };
}

// Découpe une commande bash en commandes simples, chacune en liste de mots (guillemets retirés).
export function splitCommands(rawCommand) {
  const text = stripHeredocs(rawCommand);
  const b = commandBuilder();

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end;
      b.add(text.slice(i + 1, stop));
      i = stop;
    } else if (c === '"') {
      b.add('');
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\' && i + 1 < text.length) {
          b.add(text[++i]);
        } else if (text[i] === '$' && text[i + 1] === '(') {
          const end = skipSubstitution(text, i + 1);
          b.add(text.slice(i, end));
          i = end - 1;
        } else {
          b.add(text[i]);
        }
      }
    } else if (c === '$' && text[i + 1] === '(') {
      const end = skipSubstitution(text, i + 1);
      b.add(text.slice(i, end));
      i = end - 1;
    } else if (c === '\\' && i + 1 < text.length) {
      if (text[i + 1] !== '\n') b.add(text[i + 1]);
      i++;
    } else if (c === ';' || c === '&' || c === '|' || c === '\n' || c === '(' || c === ')') {
      b.endCommand();
    } else if (c === ' ' || c === '\t') {
      b.endWord();
    } else {
      b.add(c);
    }
  }
  return b.done();
}

// Découpe une commande PowerShell en commandes simples, chacune en liste de mots.
// Séparateurs : `;`, saut de ligne, `|`, `&&`, `||`, accolades et parenthèses ; `&` seul est
// l'opérateur d'appel (`& git commit`), sauté. Guillemets simples littéraux (`''` = `'`),
// doubles avec l'échappement par accent grave, here-strings `@'…'@` / `@"…"@` lues comme un
// seul mot, accent grave en fin de ligne = continuation, `#` en début de mot = commentaire.
export function splitPowerShell(rawCommand) {
  const text = rawCommand.replace(/\r\n?/g, '\n');
  const b = commandBuilder();

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '@' && (text[i + 1] === "'" || text[i + 1] === '"') && /^[ \t]*\n/.test(text.slice(i + 2))) {
      const quote = text[i + 1];
      const start = text.indexOf('\n', i) + 1;
      const end = text.indexOf(`\n${quote}@`, start - 1);
      const stop = end === -1 ? text.length : end;
      b.add(text.slice(start, stop));
      i = end === -1 ? text.length : end + 2;
    } else if (c === "'") {
      let value = '';
      for (i++; i < text.length; i++) {
        if (text[i] === "'" && text[i + 1] === "'") {
          value += "'";
          i++;
        } else if (text[i] === "'") break;
        else value += text[i];
      }
      b.add(value);
    } else if (c === '"') {
      b.add('');
      for (i++; i < text.length; i++) {
        if (text[i] === '`' && i + 1 < text.length) {
          b.add(text[++i]);
        } else if (text[i] === '"' && text[i + 1] === '"') {
          b.add('"');
          i++;
        } else if (text[i] === '"') break;
        else if (text[i] === '$' && text[i + 1] === '(') {
          const end = skipSubstitution(text, i + 1);
          b.add(text.slice(i, end));
          i = end - 1;
        } else b.add(text[i]);
      }
    } else if (c === '$' && text[i + 1] === '(') {
      const end = skipSubstitution(text, i + 1);
      b.add(text.slice(i, end));
      i = end - 1;
    } else if (c === '$' && text[i + 1] === '{') {
      // ${env:NOM} : les accolades font partie du nom de la variable.
      const end = text.indexOf('}', i);
      const stop = end === -1 ? text.length - 1 : end;
      b.add(text.slice(i, stop + 1));
      i = stop;
    } else if (c === '`' && i + 1 < text.length) {
      if (text[i + 1] !== '\n') b.add(text[i + 1]);
      else b.endWord();
      i++;
    } else if (c === '#' && (i === 0 || /[\s;|&{}()]/.test(text[i - 1]))) {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end - 1;
    } else if (c === '&') {
      if (text[i + 1] === '&') {
        b.endCommand();
        i++;
      } else b.endWord();
    } else if (c === ';' || c === '|' || c === '\n' || c === '{' || c === '}' || c === '(' || c === ')') {
      b.endCommand();
    } else if (c === ' ' || c === '\t') {
      b.endWord();
    } else {
      b.add(c);
    }
  }
  return b.done();
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
const PS_ENV_ASSIGNMENT = /^\$(?:env:([A-Za-z_][A-Za-z0-9_]*)|\{env:([A-Za-z_][A-Za-z0-9_]*)\})=(.*)$/is;
const PS_CD = new Set(['cd', 'set-location', 'sl', 'chdir', 'push-location', 'pushd']);

// `$env:NOM = 'valeur'` : un, deux ou trois mots selon les espaces autour du `=`.
function psEnvAssignment(words) {
  if (!/^\$\{?env:/i.test(words[0])) return null;
  let text = words[0];
  let i = 1;
  if (!text.includes('=') && words[i]?.startsWith('=')) text += words[i++];
  if (text.endsWith('=') && i < words.length) text += words[i++];
  const m = PS_ENV_ASSIGNMENT.exec(text);
  return m ? { key: (m[1] ?? m[2]).toUpperCase(), value: m[3] } : null;
}

// Rend chaque appel à git de la commande, avec les variables posées devant (ou par
// `export` / `$env:` plus tôt), le dossier courant (suivi des `cd`) et les options globales.
export function gitInvocations(rawCommand, baseCwd, shell = 'bash') {
  const powershell = shell === 'powershell';
  const invocations = [];
  const exported = {};
  let cwd = baseCwd || process.cwd();

  for (const original of powershell ? splitPowerShell(rawCommand) : splitCommands(rawCommand)) {
    const words = [...original];
    const env = { ...exported };

    if (powershell) {
      const assignment = psEnvAssignment(words);
      if (assignment) {
        exported[assignment.key] = assignment.value;
        continue;
      }
      // Remove-Item Env:GIT_AUTHOR_NAME
      if (/^(remove-item|ri|rm|del)$/i.test(words[0] ?? '')) {
        for (const w of words.slice(1)) {
          const m = /^env:([A-Za-z_][A-Za-z0-9_]*)$/i.exec(w);
          if (m) delete exported[m[1].toUpperCase()];
        }
        continue;
      }
      if (PS_CD.has((words[0] ?? '').toLowerCase())) {
        const target = words.slice(1).find((w) => !w.startsWith('-'));
        if (target) cwd = resolvePath(cwd, target);
        continue;
      }
    } else {
      while (words.length && ASSIGNMENT.test(words[0])) {
        const [, key, value] = ASSIGNMENT.exec(words.shift());
        env[key] = value;
      }
      if (words[0] === 'env') {
        words.shift();
        while (words.length && ASSIGNMENT.test(words[0])) {
          const [, key, value] = ASSIGNMENT.exec(words.shift());
          env[key] = value;
        }
      }
      if (!words.length) continue;

      if (words[0] === 'export') {
        for (const w of words.slice(1)) {
          const m = ASSIGNMENT.exec(w);
          if (m) exported[m[1]] = m[2];
        }
        continue;
      }
      if (words[0] === 'cd') {
        const target = words[1];
        if (target && !target.startsWith('-')) cwd = resolvePath(cwd, target);
        continue;
      }
    }
    if (!words.length) continue;
    const program = path.basename(words[0].replaceAll('\\', '/')).toLowerCase();
    if (program !== 'git' && program !== 'git.exe') continue;

    let i = 1;
    let gitCwd = cwd;
    const configs = {};
    while (i < words.length && words[i].startsWith('-')) {
      const opt = words[i];
      if (opt === '-C') {
        gitCwd = resolvePath(gitCwd, words[i + 1] ?? '.');
        i += 2;
      } else if (opt === '-c') {
        const m = /^([^=]+)=(.*)$/s.exec(words[i + 1] ?? '');
        if (m) configs[m[1].toLowerCase()] = m[2];
        i += 2;
      } else {
        i += 1;
      }
    }
    if (i >= words.length) continue;
    invocations.push({ sub: words[i], args: words.slice(i + 1), env, cwd: gitCwd, configs });
  }
  return invocations;
}

export function currentBranch(cwd) {
  return git(['symbolic-ref', '--short', '-q', 'HEAD'], cwd);
}
