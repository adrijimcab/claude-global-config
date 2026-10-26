#!/usr/bin/env node
/**
 * The decisions of launcher unwrapping and of the PowerShell runner cmdlets, each broken once, that
 * `launchers.selftest.mjs` must catch. Every mutant keeps the code runnable and changes what it DECIDES.
 * @es Las decisiones del desenvuelto de lanzadores y de los cmdlets ejecutores de PowerShell, rotas una a una,
 * que `launchers.selftest.mjs` debe cazar. Cada mutante deja el código ejecutable y cambia lo que DECIDE.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const L = 'shell-command/launchers.mjs';
const P = 'shell-command/powershell-runners.mjs';
const S = 'shell-command/shell-command.mjs';

const MUTANTS = [
  // --- THE TABLE: what each launcher takes before its program.
  [
    'timeout no longer skips its duration',
    L,
    "timeout: { valueOptions: ['-s', '--signal', '-k', '--kill-after'], positionals: 1,",
    "timeout: { valueOptions: ['-s', '--signal', '-k', '--kill-after'], positionals: 0,"
  ],
  [
    'timeout -s takes no value',
    L,
    "timeout: { valueOptions: ['-s', '--signal', '-k', '--kill-after']",
    "timeout: { valueOptions: ['--signal', '-k', '--kill-after']"
  ],
  [
    'timeout --signal takes no value',
    L,
    "timeout: { valueOptions: ['-s', '--signal', '-k', '--kill-after']",
    "timeout: { valueOptions: ['-s', '-k', '--kill-after']"
  ],
  [
    'timeout -k takes no value',
    L,
    "timeout: { valueOptions: ['-s', '--signal', '-k', '--kill-after']",
    "timeout: { valueOptions: ['-s', '--signal', '--kill-after']"
  ],
  [
    'timeout --kill-after takes no value',
    L,
    "timeout: { valueOptions: ['-s', '--signal', '-k', '--kill-after']",
    "timeout: { valueOptions: ['-s', '--signal', '-k']"
  ],
  [
    'nice -n takes no value',
    L,
    "nice: { valueOptions: ['-n', '--adjustment']",
    "nice: { valueOptions: ['--adjustment']"
  ],
  [
    'nice --adjustment takes no value',
    L,
    "nice: { valueOptions: ['-n', '--adjustment']",
    "nice: { valueOptions: ['-n']"
  ],
  [
    'xargs -a takes no value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-d', '-E', '-I', '-L', '-n', '-P', '-s',"
  ],
  [
    'xargs -d takes no value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-E', '-I', '-L', '-n', '-P', '-s',"
  ],
  [
    'xargs -E takes no value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-I', '-L', '-n', '-P', '-s',"
  ],
  [
    'xargs -I takes no value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-E', '-L', '-n', '-P', '-s',"
  ],
  [
    'xargs -L takes no value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-E', '-I', '-n', '-P', '-s',"
  ],
  [
    'xargs -n takes no value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-P', '-s',"
  ],
  [
    'xargs -P takes no value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-s',"
  ],
  [
    'xargs -s takes no value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P',"
  ],
  [
    'xargs -i takes a separate value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '-i',"
  ],
  [
    'xargs -l takes a separate value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '-l',"
  ],
  [
    'xargs -e takes a separate value',
    L,
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s',",
    "valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '-e',"
  ],
  [
    'env -u takes no value',
    L,
    "valueOptions: ['-u', '--unset', '-C', '--chdir'], scriptOptions",
    "valueOptions: ['--unset', '-C', '--chdir'], scriptOptions"
  ],
  [
    'env --unset takes no value',
    L,
    "valueOptions: ['-u', '--unset', '-C', '--chdir'], scriptOptions",
    "valueOptions: ['-u', '-C', '--chdir'], scriptOptions"
  ],
  [
    'env -C takes no value',
    L,
    "valueOptions: ['-u', '--unset', '-C', '--chdir'], scriptOptions",
    "valueOptions: ['-u', '--unset', '--chdir'], scriptOptions"
  ],
  [
    'env --chdir takes no value',
    L,
    "valueOptions: ['-u', '--unset', '-C', '--chdir'], scriptOptions",
    "valueOptions: ['-u', '--unset', '-C'], scriptOptions"
  ],
  [
    'env -S carries no script',
    L,
    "scriptOptions: ['-S', '--split-string']",
    "scriptOptions: ['--split-string']"
  ],
  [
    'env --split-string carries no script',
    L,
    "scriptOptions: ['-S', '--split-string']",
    "scriptOptions: ['-S']"
  ],
  [
    'env does not skip assignments',
    L,
    "scriptOptions: ['-S', '--split-string'], positionals: 0, assignments: true",
    "scriptOptions: ['-S', '--split-string'], positionals: 0, assignments: false"
  ],
  ['exec -a takes no value', L, "exec: { valueOptions: ['-a']", 'exec: { valueOptions: []'],
  ['command -v is not inert', L, "inertFlags: ['-v', '-V']", "inertFlags: ['-V']"],
  ['command -V is not inert', L, "inertFlags: ['-v', '-V']", "inertFlags: ['-v']"],
  [
    'time -f takes no value',
    L,
    "time: { valueOptions: ['-f', '--format', '-o', '--output']",
    "time: { valueOptions: ['--format', '-o', '--output']"
  ],
  [
    'time --format takes no value',
    L,
    "time: { valueOptions: ['-f', '--format', '-o', '--output']",
    "time: { valueOptions: ['-f', '-o', '--output']"
  ],
  [
    'time -o takes no value',
    L,
    "time: { valueOptions: ['-f', '--format', '-o', '--output']",
    "time: { valueOptions: ['-f', '--format', '--output']"
  ],
  [
    'time --output takes no value',
    L,
    "time: { valueOptions: ['-f', '--format', '-o', '--output']",
    "time: { valueOptions: ['-f', '--format', '-o']"
  ],
  [
    'sudo -u takes no value',
    L,
    "sudo: { valueOptions: ['-u', '-g',",
    "sudo: { valueOptions: ['-g',"
  ],
  ['sudo --user takes no value', L, "'--user', '--group'", "'--group'"],
  [
    'sudo does not skip assignments',
    L,
    "'--chdir'], positionals: 0, assignments: true",
    "'--chdir'], positionals: 0, assignments: false"
  ],
  [
    'nohup is not a launcher',
    L,
    '  nohup: { valueOptions: [], positionals: 0, assignments: false, inertFlags: [] },\n',
    ''
  ],
  [
    'an inherited name is read as a launcher',
    L,
    'Object.hasOwn(LAUNCHERS, name) ? LAUNCHERS[name] : undefined',
    'name in LAUNCHERS ? LAUNCHERS[name] : undefined'
  ],

  // --- OPTION WIDTH: how many words an option occupies.
  [
    'a separate value option takes one word',
    L,
    'if (valueOptions.includes(word)) return 2;',
    'if (valueOptions.includes(word)) return 1;'
  ],
  [
    'a long option takes a cluster path',
    L,
    "if (word.startsWith('--')) return 1;",
    'if (false) return 1;'
  ],
  [
    'a cluster is not scanned',
    L,
    'for (let at = 1; at < word.length; at += 1) {',
    'for (let at = 1; at < 1; at += 1) {'
  ],
  [
    'a fused value still takes the next word',
    L,
    'return at === word.length - 1 ? 2 : 1;',
    'return 2;'
  ],
  [
    'a cluster ending in a value option takes no value',
    L,
    'return at === word.length - 1 ? 2 : 1;',
    'return 1;'
  ],

  // --- THE UNWRAP LOOP.
  [
    'an unknown-launcher scan starts on the launcher itself',
    L,
    'let index = at + 1;',
    'let index = at;'
  ],
  [
    '-- does not end the options',
    L,
    "if (!optionsEnded && word === '--') {\n      optionsEnded = true;",
    "if (!optionsEnded && word === '--') {\n      optionsEnded = false;"
  ],
  ['-- is not skipped', L, 'optionsEnded = true;\n      index += 1;', 'optionsEnded = true;'],
  [
    'options are read after --',
    L,
    "} else if (!optionsEnded && word.startsWith('-')) {",
    "} else if (word.startsWith('-')) {"
  ],
  [
    'an inert flag is read after --',
    L,
    '} else if (!optionsEnded && launcher.inertFlags.includes(word)) {',
    '} else if (launcher.inertFlags.includes(word)) {'
  ],
  [
    'an inert flag launches nothing but reports nothing',
    L,
    'return { index: at };',
    'return { index: -1 };'
  ],
  [
    'a script option is read after --',
    L,
    'const script = optionsEnded ? undefined : scriptCarried(',
    'const script = scriptCarried('
  ],
  [
    'a script option reports a program too',
    L,
    'return { index: -1, script };',
    'return { index: at, script };'
  ],
  [
    'an assignment is one word too many',
    L,
    '} else if (launcher.assignments && isAssignment(word)) {\n      index += 1;',
    '} else if (launcher.assignments && isAssignment(word)) {\n      index += 2;'
  ],
  [
    'an assignment is not skipped',
    L,
    '} else if (launcher.assignments && isAssignment(word)) {',
    '} else if (false) {'
  ],
  ['positionals are not counted down', L, 'positionalsLeft -= 1;', 'positionalsLeft -= 0;'],
  [
    'a positional is not skipped',
    L,
    'positionalsLeft -= 1;\n      index += 1;',
    'positionalsLeft -= 1;'
  ],
  [
    'a launcher with nothing after it launches itself',
    L,
    'return { index: -1 };\n}',
    'return { index: at };\n}'
  ],
  [
    'the program index is off by one',
    L,
    '    } else {\n      return { index };',
    '    } else {\n      return { index: index + 1 };'
  ],

  // --- SCRIPT OPTIONS.
  [
    'a separate script value is dropped',
    L,
    "if (word === option) return words.slice(index + 1).join(' ');",
    "if (word === option) return '';"
  ],
  [
    'a long script option needs no equals',
    L,
    'if (isLong && word.startsWith(`${option}=`))',
    'if (isLong && word.startsWith(option))'
  ],
  [
    'the long script value keeps its prefix',
    L,
    'word.slice(option.length + 1), ...words.slice(index + 1)',
    'word, ...words.slice(index + 1)'
  ],
  [
    'the long script drops the following words',
    L,
    'return [word.slice(option.length + 1), ...words.slice(index + 1)].join',
    'return [word.slice(option.length + 1)].join'
  ],
  [
    'a fused script keeps its prefix',
    L,
    'word.slice(option.length), ...words.slice(index + 1)',
    'word, ...words.slice(index + 1)'
  ],
  [
    'a fused script drops the following words',
    L,
    'return [word.slice(option.length), ...words.slice(index + 1)].join',
    'return [word.slice(option.length)].join'
  ],
  [
    'a launcher without scriptOptions is not defaulted',
    L,
    'launcher.scriptOptions ?? []',
    'launcher.scriptOptions'
  ],

  // --- POWERSHELL RUNNERS.
  [
    'iex is not a runner',
    P,
    "const EXPRESSION_RUNNERS = ['iex', 'invoke-expression'];",
    "const EXPRESSION_RUNNERS = ['invoke-expression'];"
  ],
  [
    'Invoke-Expression is not a runner',
    P,
    "const EXPRESSION_RUNNERS = ['iex', 'invoke-expression'];",
    "const EXPRESSION_RUNNERS = ['iex'];"
  ],
  [
    'Start-Process is not a runner',
    P,
    "const PROCESS_STARTERS = ['start-process', 'saps'];",
    "const PROCESS_STARTERS = ['saps'];"
  ],
  [
    'saps is not a runner',
    P,
    "const PROCESS_STARTERS = ['start-process', 'saps'];",
    "const PROCESS_STARTERS = ['start-process'];"
  ],
  [
    '-FilePath is not the program',
    P,
    "const FILE_PARAMETERS = ['-filepath'];",
    'const FILE_PARAMETERS = [];'
  ],
  [
    '-ArgumentList is not the list',
    P,
    "const ARGUMENT_PARAMETERS = ['-argumentlist', '-args'];",
    "const ARGUMENT_PARAMETERS = ['-args'];"
  ],
  [
    '-Args is not the list',
    P,
    "const ARGUMENT_PARAMETERS = ['-argumentlist', '-args'];",
    "const ARGUMENT_PARAMETERS = ['-argumentlist'];"
  ],
  ['-Wait takes a value', P, "const PROCESS_SWITCHES = ['-wait',", 'const PROCESS_SWITCHES = ['],
  ['-NoNewWindow takes a value', P, "'-nonewwindow', ", ''],
  [
    'an iex -Command name is not dropped',
    P,
    "args[0]?.toLowerCase() === '-command'",
    "args[0]?.toLowerCase() === '-never'"
  ],
  [
    'an iex -Command name is dropped from every position',
    P,
    "args[0]?.toLowerCase() === '-command' ? args.slice(1) : args",
    'args.slice(1)'
  ],
  ['iex words are joined with no space', P, "return rest.join(' ');", "return rest.join('');"],
  [
    'a bare iex runs an empty script',
    P,
    'args.length === 0 ? undefined : expressionScript(args)',
    'expressionScript(args)'
  ],
  [
    'a process switch is a positional',
    P,
    'else if (PROCESS_SWITCHES.includes(word)) continue;',
    'else if (false) continue;'
  ],
  [
    'a valued parameter is a positional',
    P,
    "else if (word.startsWith('-')) index += 1;",
    "else if (word.startsWith('-')) index += 0;"
  ],
  [
    'the program is not the first positional',
    P,
    'file ??= positionals.shift();',
    'file ??= positionals.pop();'
  ],
  [
    'the argument list is not the next positional',
    P,
    'argumentList ??= positionals.shift();',
    'argumentList ??= undefined;'
  ],
  [
    'a program-less Start-Process runs something',
    P,
    'if (file === undefined) return undefined;',
    "if (file === undefined) return '';"
  ],
  ['the file word is not quoted', P, 'return `${quoted(file)} ${', 'return `${file} ${'],
  [
    'quotes inside the file are not doubled',
    P,
    'word.split("\'").join("\'\'")',
    'word.split("\'").join("\'")'
  ],
  ['argument list commas are kept', P, ".split(',').join(' ')", ".split(';').join(' ')"],
  [
    'a missing argument list is the word undefined',
    P,
    "(argumentList ?? '')",
    '(argumentList ?? undefined)'
  ],
  [
    'a runner name that is not one still returns a script',
    P,
    '  return undefined;\n}',
    "  return '';\n}"
  ],

  // --- THE SEAMS in the lexer.
  ['an unwrapped program is never followed', S, 'at = unwrapped.index;', 'at = -1;'],
  [
    'a launcher script is lost on its way out of the loop',
    S,
    'if (unwrapped.index <= at)',
    'if (unwrapped.index === at)'
  ],
  [
    'a launcher script loses its dialect',
    S,
    'unwrapped.script === undefined ? unwrapped : { ...unwrapped, dialect: DIALECTS.BASH }',
    'unwrapped'
  ],
  [
    'a launcher script is read as PowerShell',
    S,
    '{ ...unwrapped, dialect: DIALECTS.BASH }',
    '{ ...unwrapped, dialect: DIALECTS.POWERSHELL }'
  ],
  [
    'a carried script is ignored',
    S,
    'if (carriedScript !== undefined) return { script: carriedScript, dialect: carriedDialect };',
    ''
  ],
  [
    'a carried script loses its dialect',
    S,
    'return { script: carriedScript, dialect: carriedDialect };',
    'return { script: carriedScript, dialect: DIALECTS.BASH };'
  ],
  [
    'the runner script is read as bash',
    S,
    'index: -1, script: runnerScript, dialect: DIALECTS.POWERSHELL',
    'index: -1, script: runnerScript, dialect: DIALECTS.BASH'
  ],
  [
    'a runner keeps a program of its own',
    S,
    'return { index: -1, script: runnerScript,',
    'return { index: at, script: runnerScript,'
  ],
  ['the runner cmdlets are never consulted', S, 'if (runnerScript !== undefined)', 'if (false)']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  selftest: 'shell-command/launchers.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
