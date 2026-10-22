#!/usr/bin/env node
// Genera CODEMAP.md en la raiz: arbol del repo, proposito de cada archivo de
// codigo, sus simbolos exportados (y metodos publicos de clases), los bloques
// describe de los tests y un indice de la documentacion. Es un mapa de
// navegacion para agentes: barato de regenerar (`npm run codemap`) y no se
// versiona. Si un simbolo no esta donde indica, busca con grep.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_SYMBOLS = 50;
const MAX_METHODS = 40;
/** Directories without source code and with more files than this collapse to a count. */
const COLLAPSE_AT = 8;

const SOURCE_EXTENSIONS = {
  '.ts': 'ts', '.tsx': 'ts', '.mts': 'ts', '.cts': 'ts',
  '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js',
  '.py': 'py', '.go': 'go',
};
const EXPORT_PATTERNS = {
  ts: [
    /^export\s+(default\s+)?(abstract\s+)?(async\s+)?(function\*?|class|const|let|var|interface|type|enum)\s+[A-Za-z_$]/,
    /^export\s+\{/,
    /^export\s+default\s+/,
  ],
  py: [/^(class|def|async def) [A-Za-z]/, /^[A-Z][A-Z0-9_]*\s*=/],
  go: [/^func\s+(\([^)]+\)\s+)?[A-Z]\w*\s*\(/, /^type\s+[A-Z]\w*\s/, /^(var|const)\s+[A-Z]\w*\s/],
};
EXPORT_PATTERNS.js = EXPORT_PATTERNS.ts;
/** Fallback for files without exports (entry points, scripts): top-level declarations. */
const TOP_LEVEL_PATTERN = /^(async\s+)?(function\*?|class)\s+[A-Za-z_$]/;
const MEMBER_PATTERN = /^ {2}(?:(?:public|static|readonly|async|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*[(<]/;
const NOT_METHODS = new Set(['constructor', 'if', 'for', 'while', 'switch', 'return', 'catch', 'super']);

const run = (command) => execSync(command, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const files = [...new Set([...run('git ls-files'), ...run('git ls-files --others --exclude-standard')])]
  .filter((file) => file !== 'CODEMAP.md')
  .sort();

const languageOf = (file) => SOURCE_EXTENSIONS[path.extname(file)];
const isTest = (file) => file.startsWith('tests/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
const clip = (text, length) => (text.length > length ? `${text.slice(0, length - 3)}...` : text);
const clean = (text) => text.replace(/`/g, "'").replace(/\s+/g, ' ').trim();
const humanize = (file) => path.basename(file, path.extname(file))
  .replace(/[._-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** First sentence of the comment block that ends right above `index`, if any. */
function commentAbove(lines, index) {
  let end = index - 1;
  while (end >= 0 && /^\s*@/.test(lines[end])) end--;
  if (end < 0) return '';
  const text = [];
  if (/\*\/\s*$/.test(lines[end])) {
    for (let i = end; i >= 0; i--) {
      text.unshift(lines[i].replace(/^\s*\/\*\*?\s?/, '').replace(/\*\/\s*$/, '').replace(/^\s*\*\s?/, ''));
      if (/^\s*\/\*/.test(lines[i])) break;
    }
  } else {
    for (let i = end; i >= 0 && /^\s*\/\//.test(lines[i]); i--) text.unshift(lines[i].replace(/^\s*\/\/\s?/, ''));
  }
  return firstSentence(text.join(' '));
}

function firstSentence(text) {
  const joined = clean(text);
  const stop = joined.search(/[.!?](\s|$)/);
  return clip(stop >= 0 ? joined.slice(0, stop + 1) : joined, 110);
}

/** Header comment of the file: a leading block followed by imports or a blank line, not by a declaration. */
function fileHeader(lines, language) {
  let first = 0;
  while (first < lines.length && (lines[first].startsWith('#!') || !lines[first].trim())) first++;
  if (language === 'py') {
    const match = lines.slice(first, first + 3).join('\n').match(/^\s*(?:"""|''')\s*(.+)/);
    return match ? firstSentence(match[1].replace(/("""|''').*$/, '')) : '';
  }
  if (language === 'go') {
    const match = lines.slice(0, 20).join('\n').match(/^\/\/ Package \w+ (.+)/m);
    return match ? firstSentence(match[1]) : '';
  }
  if (!/^\s*(\/\*|\/\/)/.test(lines[first] ?? '')) return '';
  let after = first;
  if (/^\s*\/\*/.test(lines[first])) {
    while (after < lines.length && !lines[after].includes('*/')) after++;
  } else {
    while (after + 1 < lines.length && /^\s*\/\//.test(lines[after + 1])) after++;
  }
  const next = lines[after + 1] ?? '';
  if (next.trim() && !/^\s*(import|'use|"use)/.test(next)) return '';
  return commentAbove(lines, after + 1);
}

function purpose(file, lines, language, declarations) {
  const stem = path.basename(file).split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const named = (decl) => decl.name && (decl.name.toLowerCase() === stem || decl.name.toLowerCase() === `build${stem}`);
  const main = declarations.find(named);
  const firstType = declarations.find((decl) => /\b(class|function)\b/.test(decl.signature));
  return (main && commentAbove(lines, main.line - 1))
    || fileHeader(lines, language)
    || (firstType && commentAbove(lines, firstType.line - 1))
    || (declarations[0] && commentAbove(lines, declarations[0].line - 1))
    || humanize(file);
}

/** Public members of the class declared at `index`: two-space-indented methods and accessors. */
function classMethods(lines, index) {
  const names = [];
  for (let i = index + 1; i < lines.length && !/^}/.test(lines[i]); i++) {
    const match = lines[i].match(MEMBER_PATTERN);
    if (!match || /^\s+(private|protected|#)/.test(lines[i])) continue;
    if (!NOT_METHODS.has(match[1]) && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

function declarationsOf(lines, patterns) {
  const found = [];
  lines.forEach((line, index) => {
    if (!patterns.some((pattern) => pattern.test(line))) return;
    let signature = line.trim();
    if (/^export\s+\{/.test(signature) && !signature.includes('}')) {
      for (let j = index + 1; j < Math.min(lines.length, index + 8); j++) {
        signature += ` ${lines[j].trim()}`;
        if (lines[j].includes('}')) break;
      }
    }
    const name = signature.match(/(?:class|function\*?|const|let|var|interface|type|enum|def)\s+([A-Za-z_$][\w$]*)/)?.[1];
    const methods = /\bclass\s/.test(signature) ? classMethods(lines, index) : [];
    found.push({ line: index + 1, name, methods, signature: clip(clean(signature.replace(/\s*\{\s*$/, '')), 90) });
  });
  return found;
}

function describeBlocks(lines) {
  const found = [];
  lines.forEach((line, index) => {
    const match = line.match(/^describe(?:\.\w+)?\(\s*(['"`])(.+?)\1/);
    if (match) found.push({ line: index + 1, signature: `describe: ${clip(clean(match[2]), 80)}`, methods: [] });
  });
  return found;
}

function renderFile(file) {
  const language = languageOf(file);
  let lines;
  try {
    lines = readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  } catch {
    return null;
  }
  const test = isTest(file);
  let symbols = test ? describeBlocks(lines) : declarationsOf(lines, EXPORT_PATTERNS[language]);
  let note = '';
  if (!test && symbols.length === 0) {
    symbols = declarationsOf(lines, [TOP_LEVEL_PATTERN]);
    note = ' (no exports)';
  }
  const shown = symbols.slice(0, MAX_SYMBOLS);
  const width = String(shown.at(-1)?.line ?? 0).length;
  const out = [`### ${file}`, `_${test ? (shown[0]?.signature.replace('describe: ', '') ?? humanize(file)) : purpose(file, lines, language, symbols)}${note}_`];
  for (const symbol of shown) {
    out.push(`- L${String(symbol.line).padEnd(width)} \`${symbol.signature}\``);
    if (symbol.methods.length) {
      const methods = symbol.methods.slice(0, MAX_METHODS).join(', ');
      const more = symbol.methods.length > MAX_METHODS ? `, +${symbol.methods.length - MAX_METHODS} more` : '';
      out.push(`  - methods: ${methods}${more}`);
    }
  }
  if (symbols.length > MAX_SYMBOLS) out.push(`- ... +${symbols.length - MAX_SYMBOLS} more (grep the file)`);
  return out.join('\n');
}

function renderTree(paths) {
  const tree = {};
  for (const file of paths) {
    let node = tree;
    for (const part of file.split('/')) node = node[part] ??= {};
  }
  const isDir = (node) => Object.keys(node).length > 0;
  const stats = (node) => {
    let count = 0;
    let source = false;
    for (const [name, child] of Object.entries(node)) {
      if (isDir(child)) {
        const inner = stats(child);
        count += inner.count;
        source ||= inner.source;
      } else {
        count++;
        source ||= Boolean(languageOf(name));
      }
    }
    return { count, source };
  };
  const lines = [`${path.basename(root)}/`];
  const walk = (node, prefix) => {
    const names = Object.keys(node).sort((a, b) => (isDir(node[a]) === isDir(node[b]) ? a.localeCompare(b) : isDir(node[a]) ? -1 : 1));
    names.forEach((name, index) => {
      const last = index === names.length - 1;
      const child = node[name];
      const branch = `${prefix}${last ? '└── ' : '├── '}`;
      if (!isDir(child)) {
        lines.push(`${branch}${name}`);
        return;
      }
      const { count, source } = stats(child);
      if (!source && count > COLLAPSE_AT) {
        lines.push(`${branch}${name}/ (${count} files, no source)`);
        return;
      }
      lines.push(`${branch}${name}/`);
      walk(child, `${prefix}${last ? '    ' : '│   '}`);
    });
  };
  walk(tree, '');
  return lines.join('\n');
}

function renderDoc(file) {
  let text;
  try {
    text = readFileSync(path.join(root, file), 'utf8');
  } catch {
    return null;
  }
  const description = text.match(/^---[\s\S]*?\ndescription:\s*(.+)\n[\s\S]*?---/)?.[1];
  const body = text.replace(/^---[\s\S]*?---\s*/, '').split(/\r?\n/);
  const title = body.find((line) => /^#\s/.test(line))?.replace(/^#\s+/, '');
  const firstLine = body.find((line) => line.trim() && !/^(#|```|\||-{3,}|<)/.test(line.trim()));
  const summary = description ?? (firstLine ? firstSentence(firstLine.replace(/^[-*]\s+/, '')) : '');
  return `- \`${file}\`${title ? ` — **${clean(title)}**` : ''}${summary ? `: ${clip(clean(summary), 140)}` : ''}`;
}

const sourceFiles = files.filter(languageOf);
const mainSources = sourceFiles.filter((file) => !isTest(file)).map(renderFile).filter(Boolean);
const testSources = sourceFiles.filter(isTest).map(renderFile).filter(Boolean);
const docs = files.filter((file) => file.endsWith('.md') && !file.startsWith('android/')).map(renderDoc).filter(Boolean);

const markdown = [
  '# CODEMAP',
  '',
  `_Generated: ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')} — regenerate with \`npm run codemap\`; not versioned._`,
  '',
  'Navigation aid: grep this file for a path (`### src/...`), a symbol or a method before exploring the repo.',
  'Built from `git ls-files` plus untracked, non-ignored files, with grep-style patterns: if something is not where it says, grep the code.',
  '',
  '## Docs',
  '',
  ...docs,
  '',
  '## Tree',
  '',
  '```',
  renderTree(files.filter((file) => !isTest(file))),
  '```',
  '',
  '## Files',
  '',
  mainSources.join('\n\n'),
  '',
  '## Tests',
  '',
  '```',
  renderTree(files.filter(isTest)),
  '```',
  '',
  testSources.join('\n\n'),
  '',
].join('\n');

writeFileSync(path.join(root, 'CODEMAP.md'), markdown);
console.log(`codemap: wrote CODEMAP.md (${files.length} files, ${mainSources.length + testSources.length} source files mapped, ${docs.length} docs)`);
