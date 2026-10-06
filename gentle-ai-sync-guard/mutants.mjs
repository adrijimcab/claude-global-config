#!/usr/bin/env node
/**
 * The decisions of the sync guard, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules (green unmutated baseline, target exactly once, parse check, non-empty campaign) live in
 * `../mutation-proof/run-mutants.mjs`. Each row names the DECISION it removes, not the line it edits.
 *
 *   node mutants.mjs      exit 0 only when every mutant is killed
 *
 * @es Las decisiones del guard de sync, rotas una a una, que `selftest.mjs` debe cazar. El runner y sus
 * reglas (línea base verde sin mutar, texto exactamente una vez, comprobación de sintaxis, campaña no vacía)
 * viven en `../mutation-proof/run-mutants.mjs`. Cada fila nombra la DECISIÓN que elimina, no la línea que edita.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutants } from '../mutation-proof/run-mutants.mjs';

// [decision label, file relative to the home directory, exact text, replacement]
// @es [etiqueta de la decisión, fichero relativo al directorio home, texto exacto, reemplazo]
const MUTANTS = [
  ['single quotes are no longer read as quotes', 'gentle-ai-sync-guard/shell-words.mjs', `    } else if (char === "'") this.readSingleQuoted();\n    else if (char === '"') this.readDoubleQuoted();\n    else if (char === '\`') {`, `    } else if (char === '"') this.readDoubleQuoted();\n    else if (char === '\`') {`],
  ['double quotes are no longer read as quotes', 'gentle-ai-sync-guard/shell-words.mjs', `    else if (char === '"') this.readDoubleQuoted();\n    else if (char === '>' || char === '<') this.readRedirection();`, `    else if (char === '>' || char === '<') this.readRedirection();`],
  ['heredoc bodies are scanned as commands', 'gentle-ai-sync-guard/shell-words.mjs', '        this.consumeHeredocBodies();', ''],
  ['an unquoted heredoc is read as literal', 'gentle-ai-sync-guard/shell-words.mjs', 'expands: !this.wordQuoted', 'expands: this.wordQuoted'],
  ['an expanding heredoc body is not scanned for substitutions', 'gentle-ai-sync-guard/shell-words.mjs', 'if (heredoc.expands) this.scanExpansions(this.text.slice(bodyStart, this.index));', ''],
  ['a tab-stripped heredoc terminator is not recognised', 'gentle-ai-sync-guard/shell-words.mjs', 'if (heredoc.stripTabs) while', 'if (false) while'],
  ['a bash comment no longer hides what it holds', 'gentle-ai-sync-guard/shell-words.mjs', "} else if (char === '#' && this.word === null) this.skipComment();", '}'],
  ['the first closing paren ends a substitution at any depth', 'gentle-ai-sync-guard/shell-words.mjs', "    else if (char === ')' && --depth === 0) return index;", "    else if (char === ')') return index;"],
  ['a redirection target is read as the program', 'gentle-ai-sync-guard/shell-words.mjs', '    this.discardNextWord = true;\n  }', '  }'],
  ['a bash backslash escape inside double quotes is ignored', 'gentle-ai-sync-guard/shell-words.mjs', "if (this.isBash && char === '\\\\' && next !== undefined && BASH_DOUBLE_QUOTE_ESCAPABLE.includes(next)) {", 'if (false) {'],
  ['a command substitution inside double quotes is not scanned', 'gentle-ai-sync-guard/shell-words.mjs', "      } else if (char === '$' && next === '(') {\n        const close = matchingParen(this.text, index + 1);", "      } else if (false) {\n        const close = matchingParen(this.text, index + 1);"],
  ['a backtick substitution is not scanned', 'gentle-ai-sync-guard/shell-words.mjs', "    else if (char === '`') {\n      const close = closingBacktick(this.text, this.index + 1);", "    else if (false) {\n      const close = closingBacktick(this.text, this.index + 1);"],
  ['an expansion inside double quotes is not scanned', 'gentle-ai-sync-guard/shell-words.mjs', "if (quote === '\"') this.scanExpansions(this.text.slice(opener + 1, end));", ''],
  ['a PowerShell block comment is read as code', 'gentle-ai-sync-guard/shell-words.mjs', "    } else if (char === '<' && next === '#') {", "    } else if (false) {"],
  ['a PowerShell backtick escape is ignored', 'gentle-ai-sync-guard/shell-words.mjs', "    } else if (!this.isBash && char === '`') {\n        this.append(next ?? '');", "    } else if (false) {\n        this.append(next ?? '');"],
  ['sudo is no longer a prefix that runs what follows', 'gentle-ai-sync-guard/executed-programs.mjs', "'nohup', 'sudo', 'env']", "'nohup', 'env']"],
  ['a PowerShell here-string is read as code', 'gentle-ai-sync-guard/shell-words.mjs', "    } else if (char === '@' && this.hereStringQuote() !== null)", "    } else if (false)"],
  ['env is no longer a prefix that runs what follows', 'gentle-ai-sync-guard/executed-programs.mjs', "'nohup', 'sudo', 'env']", "'nohup', 'sudo']"],
  ['a check killed by a signal is read as an answer', 'gentle-ai-sync-guard/overlay-check.mjs', "if (run.status === null) return { failure:", "if (false) return { failure:"],
  ['env options before the program are read as the program', 'gentle-ai-sync-guard/executed-programs.mjs', 'return !(afterEnv && word.startsWith(\'-\'));', 'return true;'],
  ['a leading assignment is read as the program', 'gentle-ai-sync-guard/executed-programs.mjs', 'if (isAssignment(word)) return false;', ''],
  ['the executable suffix is not stripped', 'gentle-ai-sync-guard/executed-programs.mjs', 'return suffix === undefined ? base : base.slice(0, -suffix.length);', 'return base;'],
  ['nested shells are not analysed', 'gentle-ai-sync-guard/executed-programs.mjs', 'const nested = nesting < MAX_NESTING ? nestedScript(invocation.program, invocation.args) : null;', 'const nested = null;'],
  ['PowerShell -Command abbreviations are not recognised', 'gentle-ai-sync-guard/executed-programs.mjs', "const flag = args.findIndex((arg) => arg.length >= 2 && '-command'.startsWith(arg.toLowerCase()));", "const flag = args.findIndex((arg) => arg === '-c');"],
  ['cmd /c scripts are not analysed', 'gentle-ai-sync-guard/executed-programs.mjs', "const flag = args.findIndex((arg) => CMD_SCRIPT_SWITCHES.has(arg.toLowerCase()));", 'const flag = -1;'],
  ['any word named sync counts as the subcommand', 'gentle-ai-sync-guard/sync-invocations.mjs', "subcommandWords(args)[0] === SUBCOMMAND", 'args.includes(SUBCOMMAND)'],
  ['--dry-run=false counts as a dry run', 'gentle-ai-sync-guard/sync-invocations.mjs', "new Set(['--dry-run', '--dry-run=true'])", "new Set(['--dry-run', '--dry-run=true', '--dry-run=false'])"],
  ['a command without a real sync is still checked', 'gentle-ai-sync-guard/decide.mjs', 'if (realSyncs.length === 0) return ALLOW;', ''],
  ['an unverifiable result no longer refuses', 'gentle-ai-sync-guard/decide.mjs', "if (blocking.some((result) => result.status === 'unverifiable')) return deny(unverifiableReason(blocking));", ''],
  ['a broken result no longer refuses', 'gentle-ai-sync-guard/decide.mjs', "if (blocking.some((result) => result.status === 'broken')) return deny(brokenReason(blocking));", ''],
  ['a check failure allows the sync', 'gentle-ai-sync-guard/decide.mjs', 'if (drift.failure !== undefined) return deny(failureReason(drift.failure));', 'if (drift.failure !== undefined) return ALLOW;'],
  ['an unexpected check exit code does not refuse', 'gentle-ai-sync-guard/decide.mjs', "if (drift.exitCode !== 1 && drift.exitCode !== 2) return deny(failureReason(`unexpected exit code ${drift.exitCode}`));", ''],
  ['an exit code no result explains does not refuse', 'gentle-ai-sync-guard/decide.mjs', "if (!drift.results.some((result) => result.status !== 'held')) return deny(", 'if (false) return deny('],
  ['sync-safe results still block', 'gentle-ai-sync-guard/decide.mjs', 'drift.results.filter((result) => result.syncSafe !== true)', 'drift.results'],
  ['the broken refusal lists the sync-safe results too', 'gentle-ai-sync-guard/decide.mjs', 'return deny(brokenReason(blocking));', 'return deny(brokenReason(drift.results));'],
  ['the refusal no longer names the apply command', 'gentle-ai-sync-guard/decide.mjs', '    ...(reapplicable ? [`  - Restore the reapplicable ones: ${APPLY_COMMAND} @es Restaurar las reaplicables: ${APPLY_COMMAND}`] : []),\n', ''],
  ['every tool is judged as bash', 'gentle-ai-sync-guard/decide.mjs', "(toolName === 'PowerShell' ? DIALECTS.POWERSHELL : DIALECTS.BASH)", '(DIALECTS.BASH)'],
  ['a check that exits without JSON reads as clean', 'gentle-ai-sync-guard/overlay-check.mjs', 'return { failure: `${checkScript} exited ${run.status} without its JSON report', 'return { exitCode: 0, results: [], f: `${checkScript} exited ${run.status} without its JSON report'],
  ['a BOM-prefixed payload is no longer read', 'gentle-ai-sync-guard/guard.mjs', 'raw.charCodeAt(0) === BYTE_ORDER_MARK ? raw.slice(1) : raw', 'raw'],
  ['the guard exits 1 instead of 0', 'gentle-ai-sync-guard/guard.mjs', '    process.exitCode = 0;\n  });', '    process.exitCode = 1;\n  });'],
  ['the guard malfunction is no longer reported', 'gentle-ai-sync-guard/guard.mjs', "write({ systemMessage: `[gentle-ai-sync-guard] malfunctioned", "void ({ systemMessage: `[gentle-ai-sync-guard] malfunctioned"],
  ['the short help flag -h no longer asks for help', 'gentle-ai-sync-guard/subcommand-words.mjs', 'new Set([\'--help\', \'-h\'])', 'new Set([\'--help\'])'],
  ['the long help flag --help no longer asks for help', 'gentle-ai-sync-guard/subcommand-words.mjs', 'new Set([\'--help\', \'-h\'])', 'new Set([\'-h\'])'],
  ['words after a help flag still name a subcommand', 'gentle-ai-sync-guard/subcommand-words.mjs', 'const beforeHelp = helpAt === -1 ? args : args.slice(0, helpAt);', 'const beforeHelp = args;'],
  ['the words after a help flag are kept instead of the ones before', 'gentle-ai-sync-guard/subcommand-words.mjs', ': args.slice(0, helpAt);', ': args.slice(helpAt + 1);'],
  ['flags are read as subcommand words', 'gentle-ai-sync-guard/subcommand-words.mjs', '.filter((arg) => !arg.startsWith(\'-\'))', '.filter(() => true)'],
  ['the failure refusal loses its Spanish half', 'gentle-ai-sync-guard/decide.mjs', 'so nothing proves the customizations are intact. @es ', 'so nothing proves the customizations are intact. '],
  ['the broken refusal heading loses its Spanish half', 'gentle-ai-sync-guard/decide.mjs', '\'Broken: @es Rotas:\'', '\'Broken: Rotas:\''],
  ['the unverifiable refusal heading loses its Spanish half', 'gentle-ai-sync-guard/decide.mjs', '\'Could not be verified: @es No se pudieron verificar:\'', '\'Could not be verified: No se pudieron verificar:\''],
  ['the guard malfunction message loses its Spanish half', 'gentle-ai-sync-guard/guard.mjs', 'UNCHECKED. @es falló', 'UNCHECKED. falló'],
  ['the overlay-check timeout failure loses its Spanish half', 'gentle-ai-sync-guard/overlay-check.mjs', ' @es no terminó`', ' no terminó`'],
  ['the overlay-check missing-array failure loses its Spanish half', 'gentle-ai-sync-guard/overlay-check.mjs', ' @es no imprimió un arreglo de resultados`', ' no imprimió un arreglo de resultados`'],
  ['the overlay-check non-JSON failure loses its Spanish half', 'gentle-ai-sync-guard/overlay-check.mjs', ' @es salió sin su informe JSON`', ' salió sin su informe JSON`'],
  ["a refusal no longer points at the overlay wrapper", "gentle-ai-sync-guard/decide.mjs", "const SYNC_COMMAND = `node \"${OVERLAY}/sync.mjs\"`;", "const SYNC_COMMAND = `node \"${OVERLAY}/check.mjs\"`;"],
  ["another program's sync subcommand counts as gentle-ai's", "gentle-ai-sync-guard/sync-invocations.mjs", "program === PROGRAM && subcommandWords", "subcommandWords"],
  ["the broken refusal loses the Spanish half of its wrapper line", "gentle-ai-sync-guard/decide.mjs", "(${SYNC_COMMAND}), which prunes again what sync puts back. \\`gentle-ai sync --dry-run\\` is always allowed. @es Despu\u00e9s", "(${SYNC_COMMAND}), which prunes again what sync puts back. \\`gentle-ai sync --dry-run\\` is always allowed. Despu\u00e9s"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['gentle-ai-sync-guard'],
  selftest: 'gentle-ai-sync-guard/selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
