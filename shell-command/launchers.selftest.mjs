#!/usr/bin/env node
/**
 * Self-test for launcher unwrapping: a program behind `timeout`, `nice`, `xargs`, `env`, `exec`, `command`,
 * `time`, `nohup`, `sudo`, or behind the PowerShell runners `iex`, `Invoke-Expression` and `Start-Process`,
 * is the command the line RUNS. Read-only plumbing (`command -v git`, a bare `timeout 5`) stays inert.
 *
 * @es Auto-test del desenvuelto de lanzadores: el programa tras `timeout`, `nice`, `xargs`, `env`, `exec`,
 * `command`, `time`, `nohup`, `sudo` o tras los ejecutores de PowerShell `iex`, `Invoke-Expression` y
 * `Start-Process` es el comando que la línea EJECUTA. La fontanería de solo lectura queda inerte.
 */

import { gitInvocations } from './git-invocations.mjs';
import { powershellRunnerScript } from './powershell-runners.mjs';
import { commandWordIndex, DIALECTS, resolveCommand, simpleCommands } from './shell-command.mjs';

let failures = 0;
let total = 0;

function expect(name, predicate) {
  total += 1;

  let ok = false;

  try {
    ok = predicate();
  } catch (error) {
    process.stdout.write(`      threw: ${error.message}\n`);
  }

  if (!ok) failures += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}\n`);
}

const subcommands = (script, dialect = DIALECTS.BASH) => gitInvocations(script, dialect, process.cwd(), 'linux').map((invocation) => invocation.subcommand);
const runsGit = (script, dialect) => subcommands(script, dialect).length > 0;
const words = (line) => line.split(' ');
const commandWord = (line) => words(line)[commandWordIndex(words(line))];

const BASH_LAUNCHED = [
  ['timeout with a duration', 'timeout 60 git commit -am x', 'commit'],
  ['timeout with a value option', 'timeout -s KILL 5 git reset --hard', 'reset'],
  ['timeout with --kill-after', 'timeout --kill-after 2 5 git push --no-verify', 'push'],
  ['timeout ending its options with --', 'timeout -- 5 git clean -fd', 'clean'],
  ['nice with -n N', 'nice -n 10 git checkout -- .', 'checkout'],
  ['nice without options', 'nice git restore .', 'restore'],
  ['nice with a fused adjustment', 'nice -n10 git reset', 'reset'],
  ['xargs with a value option', 'xargs -n 40 git update-ref -d', 'update-ref'],
  ['xargs with a fused value', 'xargs -n40 git rm', 'rm'],
  ['xargs with a cluster ending in a value option', 'xargs -0n 5 git add', 'add'],
  ['xargs with a replace string', 'xargs -I{} git checkout {}', 'checkout'],
  ['xargs -i takes its value attached, so git follows it', 'xargs -i git reset', 'reset'],
  ['xargs -l takes its value attached, so git follows it', 'xargs -l git reset', 'reset'],
  ['xargs -e takes its value attached, so git follows it', 'xargs -e git reset', 'reset'],
  ['xargs -L takes a separate value', 'xargs -L 1 git rm', 'rm'],
  ['xargs -iX carries its replace string', 'xargs -iX git rm X', 'rm'],
  ['env -S carries the command as one string', 'env -S "git reset"', 'reset'],
  ['env -S with a fused string', "env -Sgit reset", 'reset'],
  ['env --split-string=', 'env --split-string="git reset --hard"', 'reset'],
  ['env --split-string with a separate value', 'env --split-string "git reset"', 'reset'],
  ['env -i then -S', 'env -i -S "git reset"', 'reset'],
  ['timeout then env -S', 'timeout 5 env -S "git reset"', 'reset'],
  ['env with -i', 'env -i git commit -am x', 'commit'],
  ['env with -u X', 'env -u HOME git commit -am x', 'commit'],
  ['env with several -u and assignments', 'env -u A -u B X=1 Y=2 git commit -am x', 'commit'],
  ['env with --unset', 'env --unset=A git reset', 'reset'],
  ['exec', 'exec git commit -am x', 'commit'],
  ['command', 'command git commit -am x', 'commit'],
  ['time', 'time git commit -am x', 'commit'],
  ['time -p', 'time -p git reset', 'reset'],
  ['nohup', 'nohup git push --no-verify', 'push'],
  ['sudo with a user', 'sudo -u root git reset', 'reset'],
  ['a launcher behind a launcher', 'env timeout 5 git commit -am x', 'commit'],
  ['three launchers deep', 'nice env -i timeout 5 git reset', 'reset'],
  ['a launcher given by path', '/usr/bin/timeout 5 git reset', 'reset'],
  ['a launcher after &&', 'cd x && timeout 5 git reset', 'reset'],
  ['a launcher inside bash -c', "bash -c 'timeout 5 git reset'", 'reset'],
  ['bash -c behind a launcher', "timeout 5 bash -c 'git reset'", 'reset']
];

/** Per launcher: the options that take a SEPARATE value, and the words that precede the program besides them. @es Opciones con valor separado por lanzador. */
const VALUE_OPTIONS = [
  ['timeout', ['-s', '--signal', '-k', '--kill-after'], '5'],
  ['nice', ['-n', '--adjustment'], ''],
  ['xargs', ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter', '--max-args', '--max-procs', '--max-chars', '--max-lines'], ''],
  ['env', ['-u', '--unset', '-C', '--chdir'], ''],
  ['exec', ['-a'], ''],
  ['time', ['-f', '--format', '-o', '--output'], ''],
  ['sudo', ['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U', '--user', '--group', '--host', '--prompt', '--chdir'], '']
];

for (const [launcher, options, positional] of VALUE_OPTIONS) {
  for (const option of options) {
    const line = `${launcher} ${option} v ${positional} git reset`.replace('  ', ' ');

    expect(`bash: ${launcher} ${option} takes a separate value`, () => subcommands(line).includes('reset'));
  }
}

const EXTRA_BASH = [
  ['xargs --show-limits is a flag even though it ends in a value letter', 'xargs --show-limits git reset', 'reset'],
  ['an unknown long option ending in a value letter is a flag', 'xargs --zzP git reset', 'reset'],
  ['env with one assignment', 'env VAR=v git reset', 'reset'],
  ['sudo with one assignment', 'sudo VAR=v git reset', 'reset'],
  ['env with a lone dash', 'env - git reset', 'reset'],
  ['env --split-string= unquoted keeps the following words', 'env --split-string=git reset', 'reset'],
  ['env -S unquoted keeps the following words', 'env -S git reset', 'reset'],
  ['env -Sgit keeps the following words', 'env -Sgit reset', 'reset']
];

for (const [name, script, subcommand] of EXTRA_BASH) expect(`bash: ${name}`, () => subcommands(script).includes(subcommand));

expect('bash: a name inherited from Object is not a launcher', () => commandWord('constructor 5 git') === 'constructor');
expect('bash: a name inherited from Object is not a launcher (toString)', () => commandWord('toString git') === 'toString');
expect('bash: env -S has no program word, its string is the command', () => commandWordIndex(words('env -S x')) === -1);
expect('bash: the string env -S carries is read with the bash grammar', () => !subcommands("env -S 'git re`set'").includes('reset'));
expect('powershell: the script iex runs is read with the PowerShell grammar', () => subcommands("iex 'git re`set'", DIALECTS.POWERSHELL).includes('reset'));
expect('bash: an unknown long option stays a flag', () => commandWord('env --split-stringx ls') === 'ls');
expect('bash: after -- an option is the program', () => commandWord('env -- -i git') === '-i');
expect('bash: after -- an inert flag is the program', () => commandWord('command -- -v git') === '-v');
expect('bash: after -- a script option is the program', () => commandWord("env -- -S git") === '-S');
expect('bash: after -- a launcher still names its program', () => !runsGit('env -- -i git reset') && runsGit('env -- git reset'));

for (const [name, script, subcommand] of BASH_LAUNCHED) expect(`bash: ${name}`, () => subcommands(script).includes(subcommand));

expect('bash: git status behind timeout is still reported as git status', () => JSON.stringify(subcommands('timeout 60 git status')) === JSON.stringify(['status']));
expect('bash: git behind a launcher keeps its global options', () => gitInvocations('timeout 5 git -C /tmp/x commit', DIALECTS.BASH, process.cwd(), 'linux')[0]?.gitOptions.includes('-C') === true);
expect('bash: the launched program is the command word', () => commandWord('env -i timeout 5 git commit') === 'git');
expect('bash: a launcher with a dangling option still names its program', () => commandWord('timeout -s KILL 5 git') === 'git');

const INERT = [
  ['command -v', 'command -v git'],
  ['command -V', 'command -V git'],
  ['a bare timeout', 'timeout 5'],
  ['a bare env', 'env'],
  ['env with only assignments', 'env A=1 B=2'],
  ['xargs with no program', 'xargs -n 40'],
  ['a mention after echo', 'echo timeout 5 git reset'],
  ['a launcher that launches something else', 'timeout 5 ls git'],
  ['a quoted mention', "timeout 5 echo 'git reset'"],
  ['env -S of another program', 'env -S "ls git"'],
  ['env -S with nothing', 'env -S']
];

for (const [name, script] of INERT) expect(`bash inert: ${name}`, () => !runsGit(script));

expect('bash inert: command -v keeps `command` as the command word', () => commandWord('command -v git') === 'command');
expect('bash inert: a bare launcher has no command word', () => commandWordIndex(words('timeout 5')) === -1);
expect('bash inert: a prefix keyword is still skipped', () => commandWord('! git reset') === 'git');
expect('bash inert: an assignment prefix is still skipped', () => commandWord('A=1 git reset') === 'git');

const POWERSHELL_RUNNERS = [
  ['iex with a string', "iex 'git commit -am x'", 'commit'],
  ['Invoke-Expression with a string', "Invoke-Expression 'git reset --hard'", 'reset'],
  ['Invoke-Expression -Command', "Invoke-Expression -Command 'git reset'", 'reset'],
  ['IEX in capitals', "IEX 'git reset'", 'reset'],
  ['iex with a double-quoted string', 'iex "git checkout ."', 'checkout'],
  ['Start-Process positional file and list', "Start-Process git -ArgumentList 'commit -am x'", 'commit'],
  ['Start-Process -FilePath', "Start-Process -FilePath git -ArgumentList 'reset --hard'", 'reset'],
  ['Start-Process with a comma list', "Start-Process git -ArgumentList 'commit','-am','x'", 'commit'],
  ['Start-Process with switches first', "Start-Process -Wait -NoNewWindow git -ArgumentList 'reset'", 'reset'],
  ['Start-Process with a valued parameter', "Start-Process -WorkingDirectory C:\\x git -ArgumentList 'reset'", 'reset'],
  ['Start-Process with a positional list', "Start-Process git 'reset'", 'reset'],
  ['Start-Process -Args alias', "Start-Process git -Args 'reset'", 'reset'],
  ['Start-Process -Wait directly before the program', "Start-Process -Wait git -ArgumentList 'reset'", 'reset'],
  ['Start-Process -PassThru directly before the program', "Start-Process -PassThru git -ArgumentList 'reset'", 'reset'],
  ['Start-Process -NoNewWindow directly before the program', "Start-Process -NoNewWindow git -ArgumentList 'reset'", 'reset'],
  ['iex with an unquoted command', 'iex git reset', 'reset'],
  ['saps alias', "saps git -ArgumentList 'reset'", 'reset'],
  ['a path with spaces', "Start-Process 'C:\\Program Files\\Git\\cmd\\git.exe' -ArgumentList 'reset'", 'reset'],
  ['a launcher inside iex', "iex 'timeout 5 git reset'", 'reset']
];

for (const [name, script, subcommand] of POWERSHELL_RUNNERS) expect(`powershell: ${name}`, () => subcommands(script, DIALECTS.POWERSHELL).includes(subcommand));

expect('powershell: iex of git status is git status', () => JSON.stringify(subcommands("iex 'git status'", DIALECTS.POWERSHELL)) === JSON.stringify(['status']));
expect('powershell: a bare iex has no script', () => powershellRunnerScript('iex', []) === undefined);
expect('powershell: Start-Process with no program has no script', () => powershellRunnerScript('start-process', ['-Wait']) === undefined);
expect('powershell: a cmdlet that is not a runner has no script', () => powershellRunnerScript('write-output', ['x']) === undefined);
expect('powershell: the program is quoted with its quotes doubled', () => powershellRunnerScript('start-process', ["it's"]) === "'it''s' ");
expect('powershell: the program is the first positional, the list the second', () => powershellRunnerScript('start-process', ['a', 'b,c']) === "'a' b c");
expect('powershell: the list is split on commas only', () => powershellRunnerScript('start-process', ['a', 'b;c']) === "'a' b;c");
expect('powershell: iex joins its words with a space', () => powershellRunnerScript('iex', ['git', 'reset']) === 'git reset');
expect('powershell: iex -Command drops only the name', () => powershellRunnerScript('iex', ['-Command', 'git', 'reset']) === 'git reset');
expect('powershell: iex keeps a first word that is not -Command', () => powershellRunnerScript('iex', ['git', 'x']) === 'git x');
expect('powershell inert: bare iex runs nothing', () => !runsGit('iex', DIALECTS.POWERSHELL));
expect('powershell inert: Start-Process with no file runs nothing', () => !runsGit('Start-Process -Wait', DIALECTS.POWERSHELL));
expect('powershell inert: Start-Process of another program', () => !runsGit("Start-Process notepad -ArgumentList 'git reset'", DIALECTS.POWERSHELL));
expect('powershell inert: Start-Process without an argument list', () => !runsGit('Start-Process notepad', DIALECTS.POWERSHELL));
expect('powershell inert: a mention after Write-Output', () => !runsGit("Write-Output 'iex git reset'", DIALECTS.POWERSHELL));
expect('powershell: the runner scripts are emitted as nested commands', () => simpleCommands("iex 'git reset'", DIALECTS.POWERSHELL).some((command) => command.words[0] === 'git'));
expect('powershell: includeNested false does not follow the runner', () => !simpleCommands("iex 'git reset'", DIALECTS.POWERSHELL, { includeNested: false }).some((command) => command.words[0] === 'git'));

/** The commands of a line whose resolved program is `program`: a runner's written command has none. @es Los comandos cuyo programa resuelto es `program`. */
const runningProgram = (script, dialect, program) => simpleCommands(script, dialect).filter((command) => {
  const at = commandWordIndex(command.words);

  return at !== -1 && command.words[at].toLowerCase() === program;
});

expect('powershell dedup: Start-Process node runs node once', () => runningProgram('Start-Process node -ArgumentList bin/www', DIALECTS.POWERSHELL, 'node').length === 1);
expect('powershell dedup: saps runs node once', () => runningProgram('saps node -ArgumentList bin/www', DIALECTS.POWERSHELL, 'node').length === 1);
expect('powershell dedup: iex runs git once', () => runningProgram("iex 'git reset'", DIALECTS.POWERSHELL, 'git').length === 1);
expect('powershell dedup: Invoke-Expression runs git once', () => runningProgram("Invoke-Expression 'git reset'", DIALECTS.POWERSHELL, 'git').length === 1);
expect('powershell dedup: the written Start-Process is still listed once', () => simpleCommands('Start-Process node -ArgumentList bin/www', DIALECTS.POWERSHELL).filter((command) => command.words[0] === 'Start-Process').length === 1);
expect('powershell dedup: the written Start-Process names no program of its own', () => commandWordIndex(['Start-Process', 'node', '-ArgumentList', 'bin/www']) === -1);
expect('powershell dedup: the written iex names no program of its own', () => commandWordIndex(['iex', 'git reset']) === -1);
expect('powershell dedup: a runner carries its script as the command', () => {
  const resolved = resolveCommand(['Start-Process', 'node', '-ArgumentList', 'bin/www']);

  return resolved.index === -1 && resolved.script === "'node' bin/www" && resolved.dialect === DIALECTS.POWERSHELL;
});
expect('powershell dedup: iex carries its string in the PowerShell grammar', () => resolveCommand(['iex', 'git reset']).dialect === DIALECTS.POWERSHELL);
expect('powershell dedup: a launcher behind a launcher still reaches the runner', () => resolveCommand(['timeout', '5', 'iex', 'git reset']).script === 'git reset');
expect('powershell dedup: a runner with nothing to run is the command word', () => resolveCommand(['Start-Process', '-Wait']).index === 0);
expect('bash dedup: env -S carries its string in the bash grammar', () => resolveCommand(['env', '-S', 'git reset']).dialect === DIALECTS.BASH);
expect('bash dedup: bash -c keeps the written command and its nested one', () => simpleCommands("bash -c 'git reset'", DIALECTS.BASH).length === 2);

process.stdout.write(`shell-command launchers selftest: ${total - failures}/${total} passed\n`);
process.exitCode = failures === 0 ? 0 : 1;
