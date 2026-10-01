#!/usr/bin/env node
/**
 * Prueba que el selftest puede ponerse ROJO: cada mutante rompe UNA decisión del guard en una copia
 * temporal de este directorio y el selftest debe fallar contra ella. Una "muerte" solo cuenta como
 * evidencia si el selftest sin mutar está verde primero (si no, sale con 2), si el texto a mutar
 * aparece exactamente una vez y si el archivo mutado sigue parseando; si no, la muerte sería la línea
 * base, un typo o un error de sintaxis, no la discriminación del test.
 *
 *   node mutants.mjs      sale con 0 solo si todos los mutantes mueren
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// [archivo, texto exacto, reemplazo]: cada uno invierte una sola decisión.
const MUTANTS = [
  ['shell-words.mjs', `    } else if (char === "'") this.readSingleQuoted();\n    else if (char === '"') this.readDoubleQuoted();\n    else if (char === '\`') {`, `    } else if (char === '"') this.readDoubleQuoted();\n    else if (char === '\`') {`],
  ['shell-words.mjs', `    else if (char === '"') this.readDoubleQuoted();\n    else if (char === '>' || char === '<') this.readRedirection();`, `    else if (char === '>' || char === '<') this.readRedirection();`],
  ['shell-words.mjs', '        this.consumeHeredocBodies();', ''],
  ['shell-words.mjs', 'expands: !this.wordQuoted', 'expands: this.wordQuoted'],
  ['shell-words.mjs', 'if (heredoc.expands) this.scanExpansions(this.text.slice(bodyStart, this.index));', ''],
  ['shell-words.mjs', 'if (heredoc.stripTabs) while', 'if (false) while'],
  ['shell-words.mjs', "} else if (char === '#' && this.word === null) this.skipComment();", '}'],
  ['shell-words.mjs', "    else if (char === ')' && --depth === 0) return index;", "    else if (char === ')') return index;"],
  ['shell-words.mjs', '    this.discardNextWord = true;\n  }', '  }'],
  ['shell-words.mjs', "if (this.isBash && char === '\\\\' && next !== undefined && BASH_DOUBLE_QUOTE_ESCAPABLE.includes(next)) {", 'if (false) {'],
  ['shell-words.mjs', "      } else if (char === '$' && next === '(') {\n        const close = matchingParen(this.text, index + 1);", "      } else if (false) {\n        const close = matchingParen(this.text, index + 1);"],
  ['shell-words.mjs', "    else if (char === '`') {\n      const close = closingBacktick(this.text, this.index + 1);", "    else if (false) {\n      const close = closingBacktick(this.text, this.index + 1);"],
  ['shell-words.mjs', "if (quote === '\"') this.scanExpansions(this.text.slice(opener + 1, end));", ''],
  ['shell-words.mjs', "    } else if (char === '<' && next === '#') {", "    } else if (false) {"],
  ['shell-words.mjs', "    } else if (!this.isBash && char === '`') {\n        this.append(next ?? '');", "    } else if (false) {\n        this.append(next ?? '');"],
  ['executed-programs.mjs', "'nohup', 'sudo', 'env']", "'nohup', 'env']"],
  ['shell-words.mjs', "    } else if (char === '@' && this.hereStringQuote() !== null)", "    } else if (false)"],
  ['executed-programs.mjs', "'nohup', 'sudo', 'env']", "'nohup', 'sudo']"],
  ['overlay-check.mjs', "if (run.status === null) return { failure:", "if (false) return { failure:"],
  ['executed-programs.mjs', 'return !(afterEnv && word.startsWith(\'-\'));', 'return true;'],
  ['executed-programs.mjs', 'if (isAssignment(word)) return false;', ''],
  ['executed-programs.mjs', 'return suffix === undefined ? base : base.slice(0, -suffix.length);', 'return base;'],
  ['executed-programs.mjs', 'const nested = nesting < MAX_NESTING ? nestedScript(invocation.program, invocation.args) : null;', 'const nested = null;'],
  ['executed-programs.mjs', "const flag = args.findIndex((arg) => arg.length >= 2 && '-command'.startsWith(arg.toLowerCase()));", "const flag = args.findIndex((arg) => arg === '-c');"],
  ['executed-programs.mjs', "const flag = args.findIndex((arg) => CMD_SCRIPT_SWITCHES.has(arg.toLowerCase()));", 'const flag = -1;'],
  ['sync-invocations.mjs', "args.find((arg) => !arg.startsWith('-')) === SUBCOMMAND", 'args.includes(SUBCOMMAND)'],
  ['sync-invocations.mjs', "new Set(['--dry-run', '--dry-run=true'])", "new Set(['--dry-run', '--dry-run=true', '--dry-run=false'])"],
  ['decide.mjs', 'if (realSyncs.length === 0) return ALLOW;', ''],
  ['decide.mjs', "if (blocking.some((result) => result.status === 'unverifiable')) return deny(unverifiableReason(blocking));", ''],
  ['decide.mjs', "if (blocking.some((result) => result.status === 'broken')) return deny(brokenReason(blocking));", ''],
  ['decide.mjs', 'if (drift.failure !== undefined) return deny(failureReason(drift.failure));', 'if (drift.failure !== undefined) return ALLOW;'],
  ['decide.mjs', "if (drift.exitCode !== 1 && drift.exitCode !== 2) return deny(failureReason(`unexpected exit code ${drift.exitCode}`));", ''],
  ['decide.mjs', "if (!drift.results.some((result) => result.status !== 'held')) return deny(", 'if (false) return deny('],
  ['decide.mjs', 'drift.results.filter((result) => result.syncSafe !== true)', 'drift.results'],
  ['decide.mjs', 'return deny(brokenReason(blocking));', 'return deny(brokenReason(drift.results));'],
  ['decide.mjs', '...(reapplicable ? [`  - Restore the reapplicable ones: ${APPLY_COMMAND}`] : []), ', ''],
  ['decide.mjs', "(toolName === 'PowerShell' ? DIALECTS.POWERSHELL : DIALECTS.BASH)", '(DIALECTS.BASH)'],
  ['overlay-check.mjs', 'return { failure: `${checkScript} exited ${run.status} without its JSON report', 'return { exitCode: 0, results: [], f: `${checkScript} exited ${run.status} without its JSON report'],
  ['guard.mjs', 'raw.charCodeAt(0) === BYTE_ORDER_MARK ? raw.slice(1) : raw', 'raw'],
  ['guard.mjs', '    process.exitCode = 0;\n  });', '    process.exitCode = 1;\n  });'],
  ['guard.mjs', "write({ systemMessage: `[gentle-ai-sync-guard] malfunctioned", "void ({ systemMessage: `[gentle-ai-sync-guard] malfunctioned"],
];

const selftestIn = (directory) => spawnSync(process.execPath, [path.join(directory, 'selftest.mjs')], { encoding: 'utf8' });
// La última línea del selftest es su recuento "N/M passed".
const tally = (run) => run.stdout.trim().split('\n').at(-1) ?? 'sin recuento';

function measure([file, from, to]) {
  const copy = mkdtempSync(path.join(tmpdir(), 'gentle-ai-sync-guard-mutant-'));
  try {
    cpSync(HERE, copy, { recursive: true });
    const target = path.join(copy, file);
    const source = readFileSync(target, 'utf8');
    const occurrences = source.split(from).length - 1;
    if (occurrences !== 1) return { verdict: 'INVALID', note: `${occurrences} occurrences of the target` };
    writeFileSync(target, source.replace(from, to));
    if (spawnSync(process.execPath, ['--check', target]).status !== 0) return { verdict: 'INVALID', note: 'mutation does not parse' };
    const run = selftestIn(copy);
    return { verdict: run.status === 0 ? 'SURVIVED' : 'KILLED', note: tally(run) };
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

const baseline = selftestIn(HERE);
if (baseline.status !== 0) {
  console.log(`baseline selftest is RED (${tally(baseline)}): refusing to measure mutants`);
  process.exit(2);
}
console.log(`baseline: ${tally(baseline)}`);
const verdicts = MUTANTS.map((mutant) => {
  const result = measure(mutant);
  console.log(`${result.verdict.padEnd(8)} ${mutant[0]}: ${mutant[1].split('\n')[0].trim().slice(0, 64)} -> ${result.note}`);
  return result.verdict;
});
const killed = verdicts.filter((verdict) => verdict === 'KILLED').length;
console.log(`\n${killed}/${MUTANTS.length} killed`);
process.exitCode = killed === MUTANTS.length ? 0 : 1;
