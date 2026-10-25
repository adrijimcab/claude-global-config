#!/usr/bin/env node
/**
 * Self-test for foreign-delete-guard (third occurrence 2026-10-19 of worker-temp-file-collided-across-sessions:
 * writers told to "delete the scratch scripts after" removed the orchestrator's provision.mjs, engram-save.mjs,
 * mirror-odd.mjs, split-backlog.mjs and contrast.mjs from the shared session scratchpad root).
 *
 * EVERYTHING RUNS ON REAL FOLDERS. A session-tree-shaped directory under `<tmp>/claude/` holds the orchestrator's
 * files, the files the agent "wrote" (recorded in a real JSONL transcript under a `subagents` directory, the shape
 * the harness writes) and files a child process dropped. Globs are expanded by the real file system and `git clean`
 * runs in a real throwaway repository.
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - WHO CALLS: a subagent (by `agent_id`, by transcript directory), the main session (never judged), a subagent
 *     with no readable transcript (fails open).
 *   - WHAT DELETES: rm, rmdir, unlink, del, erase, rd, Remove-Item and its alias, git clean, find -delete / -exec rm,
 *     xargs rm, a nested shell, a wrapper prefix.
 *   - WHAT IS NAMED: an own file, a foreign file, a glob over both, a glob over own only, a brace list, a directory
 *     holding a foreign file, a directory the agent made, a file a child process dropped in the agent's own
 *     scratchpad subfolder, a file that does not exist, a variable, a command substitution, the pipeline.
 *   - HOW AUTHORED: the Write tool, a redirect in an earlier call, a redirect in the SAME call, mkdir, touch, cp
 *     destination; NOT authored: the Edit tool, `sed -i`, a Read, a mention.
 *   - THE SHAPE OF THE OUTPUT: bilingual, names the foreign files and says to leave them alone.
 *
 * @es Auto-test del foreign-delete-guard. Todo corre sobre carpetas reales: un árbol con forma de sesión bajo
 * `<tmp>/claude/` con ficheros del orquestador, ficheros que el agente "escribió" (anotados en un transcript JSONL
 * real bajo `subagents`) y ficheros que dejó un proceso hijo. Los globs los expande el sistema de ficheros y
 * `git clean` corre en un repositorio real descartable. Estados: quién llama, qué borra, qué nombra, cómo se
 * autoró y la forma de la salida.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { authoredPathsIn, ownershipOf } from './authorship.mjs';
import { creationTargets } from './creation-targets.mjs';
import { deletionTargets, previewFrom } from './deletion-targets.mjs';
import { foreignLeaves } from './foreign-paths.mjs';
import { evaluate } from './guard.mjs';
import { judgeDeletion } from './judge.mjs';
import { linkedWorktreeRoot } from './own-tree.mjs';
import { MESSAGES, refusalText } from './refusal.mjs';
import { braceExpansion, expandPath, wildcardMatch } from './wildcards.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}\n`);
  }
}

/** A value computed by `read`, or a marker when it throws, so a throw is a failed check and never a crash. @es El valor de `read`, o una marca si lanza. */
function safely(read) {
  try {
    return read();
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

// --- the fixture: a session-tree-shaped folder under <tmp>/claude/ ----------------------------------
mkdirSync(path.join(os.tmpdir(), 'claude'), { recursive: true });

const ROOT = mkdtempSync(path.join(os.tmpdir(), 'claude', 'fdg-selftest-'));
const SCRATCH = path.join(ROOT, 'scratchpad');
const TRANSCRIPT = path.join(ROOT, 'session', 'subagents', 'agent-abc.jsonl');
const MAIN_TRANSCRIPT = path.join(ROOT, 'session', 'main.jsonl');
const slashes = (value) => value.split('\\').join('/');
const gitBash = (value) => `/${value.charAt(0).toLowerCase()}${slashes(value).slice(2)}`;

/** A file on disk, with its folder. @es Un fichero en disco, con su carpeta. */
function put(file, content = 'x') {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);

  return file;
}

const at = (...parts) => path.join(SCRATCH, ...parts);

// the orchestrator's files (the incident's names)
for (const name of ['provision.mjs', 'engram-save.mjs', 'mirror-odd.mjs', 'split-backlog.mjs', 'contrast.mjs']) put(at(name));

// the agent's files
put(at('mine.mjs'));
put(at('mine.txt'));
put(at('mine-too.mjs'));
put(at('mydir', 'a.txt'));
put(at('mydir', 'out.log')); // dropped by a child process inside the agent's own scratchpad subfolder
put(at('work', 'built.bin')); // dropped by a child process inside a folder the agent made
put(at('shared', 'x.txt')); // foreign
put(at('shared', 'y.txt')); // authored below
put(at('emptyforeign', 'keep')); // foreign folder with one file
put(at('chain-edited.mjs')); // pre-existing; the agent only EDITED it
put(at('sedded.mjs')); // pre-existing; the agent only ran sed -i on it
put(at('copied', 'z.txt')); // the destination of a cp -r by the agent
put(at('br[1].txt')); // foreign; a name that is also a glob
put(at('fb{x,y}.txt')); // foreign; a name that is also a brace list
put(at('tick`x.txt')); // authored; a name with a backtick
put(at('nested', 'a', 'b', 'f.txt')); // foreign, three folders deep
put(at('same-call.txt')); // foreign on disk; the agent's call below writes it and removes it in one line
put(path.join(ROOT, 'afile.txt')); // a plain file where a wildcard expects folders
put(at('casedir', 'Upper.TXT')); // authored under a name with capitals
put(at('holder', 'hf.txt')); // foreign, beside a junction
put(path.join(ROOT, 'outside', 'outside-file.txt')); // what the junction points at
mkdirSync(at('emptydir'), { recursive: true }); // a foreign empty folder
symlinkSync(path.join(ROOT, 'outside'), at('holder', 'lnk'), 'junction');

const record = (name, input, cwd = SCRATCH) => ({ type: 'assistant', cwd, message: { content: [{ type: 'tool_use', id: 't1', name, input }] } });

const history = [
  record('Write', { file_path: at('mine.mjs'), content: 'x' }),
  record('Write', { file_path: at('mine-too.mjs'), content: 'x' }),
  record('Bash', { command: `echo hi > ${slashes(at('mine.txt'))}` }),
  record('Write', { file_path: at('mydir', 'a.txt'), content: 'x' }),
  record('Bash', { command: `mkdir -p ${slashes(at('work'))}` }),
  record('PowerShell', { command: `New-Item -ItemType Directory -Path '${at('mydir')}'` }),
  record('Write', { file_path: at('shared', 'y.txt'), content: 'x' }),
  record('Edit', { file_path: at('chain-edited.mjs'), old_string: 'a', new_string: 'b' }),
  record('Bash', { command: `sed -i s/a/b/ ${slashes(at('sedded.mjs'))}` }),
  record('Bash', { command: `cp -r src ${slashes(at('copied'))}` }),
  record('Write', { file_path: at('tick`x.txt'), content: 'x' }),
  record('Write', { file_path: at('casedir', 'Upper.TXT'), content: 'x' }),
  { type: 'assistant', cwd: SCRATCH, message: { content: [{ type: 'text', kind: 'tool_use', text: 'prose', name: 'Write', input: { file_path: at('contrast.mjs') } }] } },
  record('Read', { file_path: at('provision.mjs') }),
  record('Bash', { command: `cat ${slashes(at('contrast.mjs'))}` })
];

mkdirSync(path.dirname(TRANSCRIPT), { recursive: true });
// a torn line in the middle and a half-written one at the end: neither may hide what lies around it
const historyText = `${[JSON.stringify(history[0]), '{torn line', ...history.slice(1).map((entry) => JSON.stringify(entry))].join('\n')}\n{"half written line`;

writeFileSync(TRANSCRIPT, historyText);
writeFileSync(MAIN_TRANSCRIPT, '');

/** A delegated agent's call. @es Una llamada de un agente delegado. */
const asAgent = (tool, input, extra = {}) => ({ tool_name: tool, tool_input: input, cwd: SCRATCH, session_id: 's', agent_id: 'abc', transcript_path: TRANSCRIPT, ...extra });

/** The main session's call. @es Una llamada de la sesión principal. */
const asMain = (tool, input) => ({ tool_name: tool, tool_input: input, cwd: SCRATCH, session_id: 's', transcript_path: MAIN_TRANSCRIPT });

const verdictOf = (payload) => evaluate(JSON.stringify(payload))?.hookSpecificOutput?.permissionDecision;
const reasonOf = (payload) => evaluate(JSON.stringify(payload))?.hookSpecificOutput?.permissionDecisionReason ?? '';

function expect(verdict, payload, label) {
  const actual = verdictOf(payload);

  check(`${verdict}: ${label}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

const bash = (command) => asAgent('Bash', { command });
const pwsh = (command) => asAgent('PowerShell', { command });
const p = (...parts) => slashes(at(...parts));
const upperDrive = (value) => value.charAt(0).toUpperCase() + value.slice(1);

try {
  // --- the named incident and the plain cases --------------------------------------------------------
  expect('allow', bash(`rm ${p('mine.mjs')}`), 'rm of a file the agent wrote with the Write tool');
  expect('deny', bash(`rm ${p('provision.mjs')}`), 'rm of the orchestrator\'s provision.mjs (the incident)');
  expect('deny', bash(`rm ${p('engram-save.mjs')} ${p('mine.mjs')}`), 'rm naming one foreign file among own ones');
  expect('deny', bash(`rm -f ${p('*.mjs')}`), 'a glob that covers own and foreign files');
  expect('allow', bash(`rm -f ${p('mine*.mjs')}`), 'a glob that covers own files only');
  expect('allow', bash(`rm ${p('mine.txt')}`), 'rm of a file the agent made with a redirect in an earlier call');
  expect('deny', bash('rm "$SCRATCH/mine.mjs"'), 'rm through an unresolvable variable');
  expect('deny', bash('rm $(ls)'), 'rm through a command substitution');
  expect('deny', bash('rm `ls`'), 'rm through backticks');
  expect('allow', { ...asMain('Bash', { command: `rm ${p('provision.mjs')}` }) }, 'the orchestrator deleting a file (never judged)');
  expect('allow', { ...asMain('Bash', { command: 'rm "$X"' }) }, 'the orchestrator through a variable');
  expect('deny', { ...bash(`rm ${p('provision.mjs')}`), agent_id: undefined, transcript_path: TRANSCRIPT }, 'a subagent known only by its transcript directory');

  // --- who is judged and the failure modes -----------------------------------------------------------
  expect('allow', { ...bash(`rm ${p('provision.mjs')}`), transcript_path: undefined }, 'a subagent with no transcript path: cannot decide, fails open');
  expect('allow', { ...bash(`rm ${p('provision.mjs')}`), transcript_path: path.join(ROOT, 'session', 'subagents', 'nope.jsonl') }, 'a transcript that cannot be read fails open');
  expect('deny', { ...bash('rm "$X"'), transcript_path: undefined }, 'an unresolvable target is refused even with no transcript');
  expect('allow', bash('echo rm provision.mjs'), 'rm only mentioned');
  expect('allow', bash(`cat ${p('provision.mjs')}`), 'a read');
  expect('allow', bash('git commit -m "rm provision.mjs"'), 'rm inside a commit message');
  expect('allow', asAgent('Read', { file_path: at('provision.mjs') }), 'a Read tool call');
  expect('allow', asAgent('Write', { command: `rm ${p('provision.mjs')}` }), 'a non-shell tool is not parsed as a shell line, whatever fields it carries');
  expect('allow', bash(`rm ${p('does-not-exist.mjs')}`), 'rm of a file that does not exist deletes nothing');
  expect('allow', bash(`rm ${p('nothing-*.zzz')}`), 'a glob that matches nothing deletes nothing');
  check('malformed JSON passes (fails open)', evaluate('{not json') === undefined);
  check('a payload with no tool_input passes', evaluate(JSON.stringify({ tool_name: 'Bash', agent_id: 'a1' })) === undefined);
  check('a BOM-prefixed payload is parsed', evaluate(`\uFEFF${JSON.stringify(bash(`rm ${p('provision.mjs')}`))}`)?.hookSpecificOutput?.permissionDecision === 'deny');

  // --- the commands that delete ----------------------------------------------------------------------
  for (const [label, command] of [
    ['rmdir', `rmdir ${p('shared')}`],
    ['unlink', `unlink ${p('provision.mjs')}`],
    ['del', `del ${p('provision.mjs')}`],
    ['erase', `erase ${p('provision.mjs')}`],
    ['rd', `rd ${p('shared')}`],
    ['rm -rf of a foreign folder', `rm -rf ${p('shared')}`],
    ['rm -rf with options after --', `rm -rf -- ${p('provision.mjs')}`],
    ['a path-qualified rm', `/usr/bin/rm ${p('provision.mjs')}`],
    ['sudo rm', `sudo rm ${p('provision.mjs')}`],
    ['env rm', `env rm ${p('provision.mjs')}`],
    ['rm after a cd', `cd ${p('')} && rm provision.mjs`],
    ['rm in a subshell', `(rm ${p('provision.mjs')})`],
    ['rm in bash -c', `bash -c "rm ${p('provision.mjs')}"`],
    ['rm after a pipe separator', `echo x | rm ${p('provision.mjs')}`],
    ['cmd /c del with its flags', `cmd /c del /f /q ${p('provision.mjs')}`],
    ['rm of a Git Bash drive spelling', `rm ${gitBash(at('provision.mjs'))}`],
    ['rm with an upper-case drive spelling', `rm ${upperDrive(p('provision.mjs'))}`]
  ]) {
    expect('deny', bash(command), label);
  }

  expect('allow', bash(`rm ${gitBash(at('mine.mjs'))}`), 'own file named in the Git Bash drive spelling');
  expect('allow', bash(`rm ${slashes(at('MINE.MJS'))}`), 'own file named in another case (Windows folds case)');
  expect('allow', bash(`cd ${p('')} && rm mine.mjs`), 'own file through a cd and a relative name');
  expect('deny', bash(`cd ${p('')} && rm provision.mjs`), 'foreign file through a cd and a relative name');
  expect('allow', bash('rm'), 'rm with no operand');
  expect('allow', bash('rm -rf'), 'rm with options only');

  // --- globs, brace lists, directories ---------------------------------------------------------------
  expect('deny', bash(`rm ${p('mine.{mjs,txt}')} ${p('provision.mjs')}`), 'a brace list beside a foreign file');
  expect('allow', bash(`rm ${p('mine.{mjs,txt}')}`), 'a brace list of own files');
  expect('deny', bash(`rm ${p('{mine,provision}.mjs')}`), 'a brace list reaching a foreign file');
  expect('deny', bash(`rm ${p('x{1..3}.mjs')}`), 'a brace range cannot be known before it runs');
  expect('deny', bash(`rm ${p('mine.m?s')} ${p('prov[a-z]*.mjs')}`), 'a ? and a [range] glob reaching a foreign file');
  expect('allow', bash(`rm ${p('mine.m?s')}`), 'a ? glob over own files only');
  expect('allow', bash(`rm ${p('mine.[mt][jx][st]')}`), 'a [class] glob over own files only');
  expect('allow', bash(`rm -rf ${p('work')}`), 'a folder the agent made, with a file a child process dropped in it');
  expect('allow', bash(`rm -rf ${p('mydir')}`), 'the agent\'s own scratchpad subfolder, with a file a child process dropped in it');
  expect('allow', bash(`rm ${p('mydir', 'out.log')}`), 'a child process\'s file inside the agent\'s own scratchpad subfolder');
  expect('allow', bash(`rm ${p('mydir', '*')}`), 'a glob inside the agent\'s own scratchpad subfolder');
  expect('deny', bash(`rm -rf ${p('shared')}`), 'a folder holding a foreign file');
  expect('allow', bash(`rm ${p('shared', 'y.txt')}`), 'the one authored file of a mixed folder');
  expect('deny', bash(`rm ${p('shared', '*')}`), 'a glob over a mixed folder');
  expect('deny', bash(`rm -rf ${p('emptyforeign')}`), 'a foreign folder the agent did not make');
  expect('allow', bash(`rm -rf ${p('copied')}`), 'the destination of a cp -r the agent ran');
  expect('allow', bash(`mkdir ${p('fresh')} && touch ${p('fresh', 'f.txt')} && rm -rf ${p('fresh')}`), 'a folder made and removed in one call');
  expect('allow', bash(`echo x > ${p('same-call.txt')} && rm ${p('same-call.txt')}`), 'a file written and removed in the SAME call');
  expect('deny', bash(`echo x > ${p('same-call.txt')} && rm ${p('provision.mjs')}`), 'the same call also removing a foreign file');
  expect('deny', bash(`rm ${p('chain-edited.mjs')}`), 'a file the agent only edited was not created by it');
  expect('deny', bash(`rm ${p('sedded.mjs')}`), 'a file the agent only ran sed -i on was not created by it');
  expect('deny', bash(`rm ${p('contrast.mjs')}`), 'a file the agent only read');

  // --- find, xargs, pipelines ------------------------------------------------------------------------
  expect('deny', bash(`find ${p('')} -name '*.mjs' -delete`), 'find -delete over a folder with foreign files');
  expect('allow', bash(`find ${p('mydir')} -name '*.log' -delete`), 'find -delete inside the agent\'s own subfolder');
  expect('deny', bash(`find ${p('')} -name '*.mjs' -exec rm {} \\;`), 'find -exec rm over a folder with foreign files');
  expect('allow', bash(`find ${p('mydir')} -type f -exec rm {} +`), 'find -exec rm inside the agent\'s own subfolder');
  expect('allow', bash(`find ${p('')} -name '*.mjs'`), 'find without a deleting action');
  expect('deny', bash('ls | xargs rm'), 'xargs rm: the operands arrive on stdin');
  expect('deny', bash(`find ${p('mydir')} -name '*.log' | xargs -0 -n 5 rm -f`), 'xargs with options before rm');
  expect('deny', bash('cat list.txt | xargs -I{} rm {}'), 'xargs -I rm');
  expect('deny', bash('cat list.txt | xargs sh -c "rm {}"'), 'xargs through a shell');
  expect('allow', bash('ls | xargs echo'), 'xargs of a command that does not delete');

  // --- PowerShell ------------------------------------------------------------------------------------
  expect('allow', pwsh(`Remove-Item -Path '${at('mine.mjs')}' -Force`), 'Remove-Item of an own file');
  expect('deny', pwsh(`Remove-Item '${at('provision.mjs')}'`), 'Remove-Item of a foreign file');
  expect('deny', pwsh(`ri ${at('provision.mjs')}`), 'the ri alias');
  expect('deny', pwsh(`rm ${at('provision.mjs')}`), 'the rm alias of PowerShell');
  expect('deny', pwsh(`Remove-Item -LiteralPath '${at('provision.mjs')}' -Confirm:$false`), 'Remove-Item -LiteralPath');
  expect('deny', pwsh(`Remove-Item -Path ${at('mine.mjs')},${at('provision.mjs')}`), 'a comma list with a foreign file');
  expect('deny', pwsh(`Remove-Item ${at('*.mjs')}`), 'a glob over own and foreign files');
  expect('deny', pwsh(`Remove-Item -Recurse -Force ${at('shared')}`), 'Remove-Item -Recurse of a mixed folder');
  expect('deny', pwsh(`Get-ChildItem ${at('')} -Filter *.mjs | Remove-Item`), 'Remove-Item fed by the pipeline');
  expect('deny', pwsh('Remove-Item $env:TEMP\\x.txt'), 'Remove-Item through a variable');
  expect('allow', pwsh(`Remove-Item -WhatIf '${at('provision.mjs')}'`), 'Remove-Item -WhatIf deletes nothing');
  expect('allow', pwsh(`Remove-Item -Path '${at('mine.mjs')}' -ErrorAction SilentlyContinue`), 'a value option does not become a target');
  expect('allow', pwsh(`Remove-Item '${at('mydir', '*')}' -Include *.log`), 'a glob inside the own subfolder with -Include');

  // --- git clean -------------------------------------------------------------------------------------
  const repo = path.join(ROOT, 'repo');
  const repoMine = path.join(ROOT, 'repo-mine');

  for (const dir of [repo, repoMine]) {
    mkdirSync(dir, { recursive: true });
    spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', windowsHide: true });
  }

  put(path.join(repo, 'foreign.tmp'));
  put(path.join(repo, 'ñandú.tmp')); // git quotes a name like this unless told not to
  put(path.join(repo, 'mine.tmp'));
  put(path.join(repoMine, 'mine.tmp'));
  put(path.join(repoMine, '-if.tmp')); // a pathspec that looks like clean options
  mkdirSync(path.join(ROOT, 'not-a-repo'), { recursive: true });

  const repoRecords = [
    record('Write', { file_path: path.join(repo, 'mine.tmp'), content: 'x' }, repo),
    record('Write', { file_path: path.join(repoMine, 'mine.tmp'), content: 'x' }, repoMine),
    record('Write', { file_path: path.join(repoMine, '-if.tmp'), content: 'x' }, repoMine)
  ];
  const repoTranscript = path.join(ROOT, 'repo-session', 'subagents', 'agent-repo.jsonl');

  mkdirSync(path.dirname(repoTranscript), { recursive: true });
  writeFileSync(repoTranscript, repoRecords.map((entry) => JSON.stringify(entry)).join('\n'));

  const inRepo = (command, cwd) => asAgent('Bash', { command }, { cwd, transcript_path: repoTranscript });

  expect('deny', inRepo('git clean -f', repo), 'git clean over a repository holding a foreign untracked file');
  expect('deny', inRepo('git clean -fd', repo), 'git clean -fd');
  expect('deny', inRepo('git clean -fdx', repo), 'git clean -fdx');
  expect('deny', inRepo(`git -C ${slashes(repo)} clean -f`, ROOT), 'git -C <repo> clean -f from another folder');
  expect('deny', inRepo('git clean -f -- foreign.tmp', repo), 'git clean -f of a named foreign file');
  expect('allow', inRepo('git clean -f -- mine.tmp', repo), 'git clean -f of a named own file');
  expect('allow', inRepo('git clean -f', repoMine), 'git clean over a repository whose only untracked file is own');
  expect('allow', inRepo('git clean -n', repo), 'git clean -n lists and deletes nothing');
  expect('allow', inRepo('git clean -fn', repo), 'git clean -fn (dry run in a cluster)');
  expect('allow', inRepo('git clean --dry-run -f', repo), 'git clean --dry-run');
  expect('allow', inRepo('git status', repo), 'another git command');
  expect('allow', inRepo('git clean -f -- -if.tmp', repoMine), 'a pathspec that looks like clean options is passed through untouched after --');
  expect('deny', inRepo('git clean -f -enode_modules', repo), 'an exclude pattern glued to -e is not read as the dry-run flag');
  check('git clean -fdi previews without the interactive flag and names the foreign file', reasonOf(inRepo('git clean -fdi', repo)).includes('foreign.tmp'));
  expect('deny', inRepo('git clean -f', path.join(ROOT, 'not-a-repo')), 'git clean where git cannot list what it would remove');

  // --- the agent's own linked worktree ---------------------------------------------------------------
  const worktree = path.join(ROOT, 'worktree');

  put(path.join(worktree, '.git'), 'gitdir: elsewhere');
  put(path.join(worktree, 'src', 'old.ts'));
  put(path.join(worktree, 'src', 'sub', 'dir', 'deep.ts'));

  expect('allow', asAgent('Bash', { command: `rm ${slashes(path.join(worktree, 'src', 'old.ts'))}` }, { cwd: worktree }), 'a file inside the agent\'s own linked worktree');
  expect('allow', asAgent('Bash', { command: 'rm -rf src/sub' }, { cwd: path.join(worktree, 'src') }), 'a relative folder inside the agent\'s own linked worktree, from a subfolder');
  expect('deny', asAgent('Bash', { command: `rm ${p('provision.mjs')}` }, { cwd: worktree }), 'a file outside the worktree even from a worktree');
  expect('deny', asAgent('Bash', { command: 'rm "$X"' }, { cwd: worktree }), 'a variable even inside a worktree');
  expect('deny', asAgent('Bash', { command: `rm ${slashes(path.join(worktree, 'src', 'old.ts'))}` }, { cwd: SCRATCH }), 'the same file when the agent does not stand in that worktree');

  // --- names that look like syntax, folders that hold traps ------------------------------------------
  expect('deny', bash(`rm ${p('br[1].txt')}`), 'a foreign file whose name is also a glob (the literal name counts)');
  expect('deny', pwsh(`Remove-Item -LiteralPath '${at('fb{x,y}.txt')}'`), 'a foreign file whose name is also a brace list, in PowerShell where braces are not expanded');
  expect('allow', pwsh(`Remove-Item -LiteralPath '${at('tick`x.txt')}'`), 'an own file with a backtick in its name, in PowerShell where a backtick is not a substitution');
  expect('deny', bash('rm %TEMP%/x.txt'), 'a cmd-style variable');
  expect('deny', bash(`rmdir ${p('emptydir')}`), 'a foreign empty folder');
  expect('deny', bash(`rm -rf ${p('nested')}`), 'a foreign file three folders deep');
  check('the refusal names the file three folders deep', reasonOf(bash(`rm -rf ${p('nested')}`)).includes('f.txt'));
  expect('deny', bash(`rm -rf ${p('holder')}`), 'a folder holding a foreign file and a junction');
  check('a junction is a leaf: the refusal names the link and never the target\'s files', reasonOf(bash(`rm -rf ${p('holder')}`)).includes('lnk') && !reasonOf(bash(`rm -rf ${p('holder')}`)).includes('outside-file.txt'));
  expect('deny', bash('xargs env rm'), 'xargs through a wrapper prefix');
  expect('deny', bash(`rm ${p('provision.mjs')} && rmdir ${p('provision.mjs')}`), 'the same foreign file named twice');
  check('the refusal names the first command that reaches the file', reasonOf(bash(`rm ${p('provision.mjs')} && rmdir ${p('provision.mjs')}`)).includes('and rm would delete 1 file'));
  expect('allow', bash('powershell -Command "Remove-Item -WhatIf ' + p('provision.mjs') + '"'), 'a nested PowerShell Remove-Item -WhatIf under Bash');
  expect('allow', bash('pwsh -c "ri -WhatIf ' + p('provision.mjs') + '"'), 'the ri alias -WhatIf in a nested shell');
  expect('allow', bash(`find ${p('')} -name '*.mjs' -exec echo {} ;`), 'find -exec of a command that does not delete');
  expect('allow', bash(`find -L ${p('mydir')} -delete`), 'find with a leading -L before its start path');
  expect('deny', bash(`find -name '*.mjs' -delete`), 'find with no start path deletes under the working directory');
  expect('allow', pwsh(`Remove-Item -LiteralPath '${at('mine.mjs')}'`), 'Remove-Item -LiteralPath of an own file');
  expect('allow', pwsh(`Remove-Item -Path:'${at('mine.mjs')}'`), 'Remove-Item -Path:value of an own file');
  expect('allow', pwsh(`Remove-Item -wi '${at('provision.mjs')}'`), 'the -wi alias of -WhatIf');

  const mainCheckout = path.join(ROOT, 'maincheckout');

  put(path.join(mainCheckout, 'src', 'x.ts'));
  mkdirSync(path.join(mainCheckout, '.git'), { recursive: true });

  expect('deny', asAgent('Bash', { command: 'rm src/x.ts' }, { cwd: mainCheckout }), 'a file of the MAIN checkout (shared): a .git directory is not a linked worktree');

  // --- the judge on its own, with injected edges -------------------------------------------------------
  /** The judge's verdict, or a marker when it throws, so a throw is a failed check and never a crash. @es El veredicto del juez, o una marca si lanza. */
  function judged(command, seams = {}, dialect = 'bash') {
    try {
      return judgeDeletion(bash(command), dialect, command, seams);
    } catch (error) {
      return { threw: error.message };
    }
  }

  const neverRead = () => {
    throw new Error('the transcript was read');
  };

  check('judge: a line that deletes nothing never reads the transcript', judged('ls -la', { transcriptOf: neverRead }) === undefined);
  check('judge: an unresolvable target is refused without reading the transcript', judged('rm "$X"', { transcriptOf: neverRead })?.code === 'variable');
  check('judge: a missing transcript cannot decide and allows', judged(`rm ${p('provision.mjs')}`, { transcriptOf: () => undefined }) === undefined);
  check('judge: a deletion over the walk limit is refused as unresolvable', judged(`rm -rf ${p('shared')}`, { limit: 1 })?.code === 'limit');
  check('judge: a walk exactly at the limit is judged, not refused', judged(`rm -rf ${p('shared')}`, { limit: 2 })?.kind === 'foreign');
  check('judge: the foreign verdict lists each foreign file once', judged(`rm ${p('provision.mjs')} ${p('provision.mjs')}`)?.files?.length === 1);

  const sharedFolder = foreignLeaves(at('shared'), ownershipOf([at('shared', 'y.txt')], undefined), 2);

  check('foreignLeaves: only the foreign file of a mixed folder', sharedFolder.foreign.length === 1 && sharedFolder.foreign[0].endsWith('x.txt') && !sharedFolder.exceeded);
  check('foreignLeaves: a walk past the limit is exceeded', foreignLeaves(at('shared'), ownershipOf([], undefined), 1).exceeded);
  check('foreignLeaves: a path that does not exist holds nothing', foreignLeaves(at('nothing'), ownershipOf([], undefined)).foreign.length === 0);

  // --- the decision units ----------------------------------------------------------------------------
  check('wildcard: * matches a run', wildcardMatch('a*c', 'abbbc') && !wildcardMatch('a*c', 'abbbd'));
  check('wildcard: * matches the empty run and a leading dot', wildcardMatch('a*', 'a') && wildcardMatch('*', '.hidden'));
  check('wildcard: several * backtrack', wildcardMatch('*a*b*', 'xxaxxbxx') && !wildcardMatch('*a*b*', 'xxbxxaxx'));
  check('wildcard: ? matches exactly one', wildcardMatch('a?c', 'abc') && !wildcardMatch('a?c', 'ac') && !wildcardMatch('a?c', 'abbc'));
  check('wildcard: a [class]', wildcardMatch('[abc]x', 'bx') && !wildcardMatch('[abc]x', 'dx'));
  check('wildcard: a [range]', wildcardMatch('[a-c]x', 'bx') && !wildcardMatch('[a-c]x', 'dx'));
  check('wildcard: a negated class with ! and ^', wildcardMatch('[!a]x', 'bx') && !wildcardMatch('[!a]x', 'ax') && wildcardMatch('[^a]x', 'bx') && !wildcardMatch('[^a]x', 'ax'));
  check('wildcard: an unclosed [ is literal', wildcardMatch('a[b', 'a[b') && !wildcardMatch('a[b', 'ab'));
  check('wildcard: a literal pattern needs the whole name', wildcardMatch('abc', 'abc') && !wildcardMatch('abc', 'abcd') && !wildcardMatch('abcd', 'abc'));
  check('wildcard: case folds only when asked', !wildcardMatch('ABC', 'abc') && wildcardMatch('ABC', 'abc', true));
  check('wildcard: a pattern longer than the name does not match', !wildcardMatch('a*bc', 'ab'));
  check('wildcard: a trailing dash in a class is a literal dash', wildcardMatch('[a-]x', '-x') && wildcardMatch('[a-]x', 'ax') && !wildcardMatch('[a-]x', 'bx'));
  check('wildcard: a range includes both of its ends', wildcardMatch('[a-c]', 'a') && wildcardMatch('[a-c]', 'c') && !wildcardMatch('[b-c]', 'a') && !wildcardMatch('[a-b]', 'c'));
  check('wildcard: a class and a star in one pattern', wildcardMatch('[ab]*z', 'bxyz') && !wildcardMatch('[ab]*z', 'cxyz'));
  check('brace: more than a thousand words is unsupported, never truncated', braceExpansion('{a,b}'.repeat(11)).unsupported === true && braceExpansion('{a,b}'.repeat(9)).words.length === 512);
  check('expandPath: case folds where the file system folds it', expandPath(at('MINE*.MJS')).length === (process.platform === 'win32' ? 2 : 0));
  check('refusal: a walk limit is worded in both languages', safely(() => refusalText({ kind: 'unresolved', code: 'limit', via: 'rm' })).includes('more entries') && safely(() => refusalText({ kind: 'unresolved', code: 'limit', via: 'rm' })).includes('más entradas'));
  check('brace: a list',braceExpansion('a.{x,y}').words.join() === 'a.x,a.y');
  check('brace: two lists multiply', braceExpansion('{a,b}{1,2}').words.join() === 'a1,a2,b1,b2');
  check('brace: a nested list', braceExpansion('{a,{b,c}}').words.join() === 'a,b,c');
  check('brace: no comma is literal', braceExpansion('a{b}c').words.join() === 'a{b}c' && braceExpansion('{}').words.join() === '{}');
  check('brace: a range is reported unsupported', braceExpansion('x{1..3}').unsupported === true && braceExpansion('x{a,b}').unsupported === false);
  check('brace: an unclosed brace is literal', braceExpansion('a{b,c').words.join() === 'a{b,c');
  check('brace: an empty alternative', braceExpansion('a{,b}').words.join() === 'a,ab');

  const expanded = expandPath(at('mine*.mjs')).map((file) => path.basename(file)).sort().join();

  check('expandPath: reads the real folder', expanded === 'mine-too.mjs,mine.mjs', expanded);
  check('expandPath: a wildcard in a folder segment', expandPath(path.join(ROOT, '*', 'mine.mjs')).filter((file) => existsSync(file)).length === 1);
  check('expandPath: a literal path comes back whether or not it exists', expandPath(at('nope.txt')).length === 1);
  check('expandPath: a wildcard under a missing folder yields nothing', expandPath(path.join(ROOT, 'missing', '*')).length === 0);

  const targetsOf = (command, dialect = 'bash') => deletionTargets(command, dialect, SCRATCH);

  check('targets: rm names its operands only', targetsOf(`rm -rf -v ${p('mine.mjs')}`).map((target) => path.basename(target.path)).join() === 'mine.mjs');
  check('targets: a command with no deleter has none', targetsOf('ls -la').length === 0);
  check('targets: a variable is reported as unresolvable with its reason', targetsOf('rm "$X"')[0]?.unresolvable === 'variable');
  check('targets: an unknowable directory is reported', safely(() => deletionTargets('cd "$X" && rm a', 'bash', SCRATCH)[0]?.unresolvable) === 'directory');
  check('targets: xargs reports stdin', targetsOf('ls | xargs rm')[0]?.unresolvable === 'stdin');
  check('targets: Remove-Item with no operand reports the pipeline', targetsOf('Get-ChildItem | Remove-Item', 'powershell')[0]?.unresolvable === 'pipeline');
  check('targets: bash rm with no operand deletes nothing', targetsOf('rm -f').length === 0);
  check('targets: every target names the command', targetsOf(`rm ${p('mine.mjs')}`)[0]?.via === 'rm' && targetsOf(`find ${p('')} -delete`)[0]?.via === 'find -delete');
  check('targets: a git clean preview that fails is reported', deletionTargets('git clean -f', 'bash', path.join(ROOT, 'not-a-repo'))[0]?.unresolvable === 'preview');
  check('targets: -- ends the options', targetsOf(`rm -- ${p('mine.mjs')} -weird`).length === 2 && targetsOf('rm -- -weird').length === 1);

  const names = (entries) => entries.map((entry) => (entry.path === undefined ? '(unresolvable)' : path.basename(entry.path)));

  check('targets: a line of only an assignment deletes nothing and does not throw', safely(() => targetsOf('FOO=1').length) === 0);
  check('targets: cmd flags (/q /f /a:r) are not operands', targetsOf(`del /q /f /a:r ${p('mine.mjs')}`).length === 1);
  check('targets: a slash word that is not a one-letter flag is an operand', targetsOf('del /abc').length === 1 && targetsOf('del /1').length === 1);
  check('targets: Remove-Item value parameters are not operands', ['-Include *.log', '-Exclude *.log', '-Filter *.log', '-ErrorAction Stop', '-ea Stop'].every((option) => targetsOf(`Remove-Item -Path ${p('mine.mjs')} ${option}`, 'powershell').length === 1));
  check('targets: -Path:value (colon form) is the operand', names(targetsOf(`Remove-Item -Path:${p('mine.mjs')}`, 'powershell')).join() === 'mine.mjs');
  const commaList = names(targetsOf(`Remove-Item ${p('mine.mjs')},${p('mine.txt')}`, 'powershell'));

  check('targets: a comma list is read both as several paths and as one path with commas', commaList.length === 3 && commaList.includes('mine.mjs') && commaList.includes('mine.txt'), commaList.join(' | '));
  check('targets: find -execdir, -ok and -okdir with a remover delete', ['-execdir', '-ok', '-okdir'].every((action) => targetsOf(`find ${p('mydir')} ${action} rm {} +`).length === 1));
  check('targets: find reports the action that deletes', targetsOf(`find ${p('mydir')} -exec rm {} +`)[0]?.via === 'find -exec rm');
  check('targets: find with no deleting action has none', targetsOf(`find ${p('mydir')} -exec echo {} +`).length === 0);
  check('targets: find with several start paths lists each', targetsOf(`find ${p('mydir')} ${p('work')} -delete`).length === 2);
  check('targets: find with no start path starts at the working directory', names(targetsOf('find -delete')).join() === path.basename(SCRATCH));
  check('targets: xargs options with a value are skipped', targetsOf('xargs -n 5 rm')[0]?.via === 'xargs rm' && targetsOf('xargs -P 4 -I {} rm')[0]?.via === 'xargs rm');
  check('targets: a git clean with the directory unknowable is reported', safely(() => deletionTargets('cd "$X" && git clean -f', 'bash', SCRATCH).some((target) => target.unresolvable === 'directory')) === true);
  check('targets: a git clean the preview lists becomes its listed paths', names(deletionTargets('git clean -f', 'bash', SCRATCH, { cleanPreview: () => ({ ok: true, paths: ['a.tmp', 'b/'] }) })).join() === 'a.tmp,b');
  check('targets: git clean -i runs its preview without the interactive flag', (() => {
    const seen = [];

    deletionTargets('git clean -fdi -e keep -x', 'bash', SCRATCH, { cleanPreview: (_directory, args) => { seen.push(args.join(' ')); return { ok: true, paths: [] }; } });
    deletionTargets('git clean --interactive -f', 'bash', SCRATCH, { cleanPreview: (_directory, args) => { seen.push(args.join(' ')); return { ok: true, paths: [] }; } });
    deletionTargets('git clean -f -enode_ignore -- -if.tmp', 'bash', SCRATCH, { cleanPreview: (_directory, args) => { seen.push(args.join(' ')); return { ok: true, paths: [] }; } });

    return seen.join('|') === 'clean -n -fd -e keep -x|clean -n -f|clean -n -f -enode_ignore -- -if.tmp';
  })());
  check('preview: lists what git would remove, CRLF or LF', previewFrom('Would remove a.tmp\r\nWould skip repository r\nWould remove b/\n').paths.join() === 'a.tmp,b/');
  check('preview: a name git quoted cannot be trusted', previewFrom('Would remove "a\\"b.tmp"\n').ok === false && previewFrom('Would remove a.tmp\n').ok === true);

  check('creation: mkdir with a mode and touch with a date take their values', creationTargets('mkdir -m 755 -p d1 d2 && touch -d "2020-01-01" f1', 'bash', SCRATCH).map((entry) => path.basename(entry.path)).join() === 'd1,d2,f1');
  check('creation: mkdir brace lists are expanded', creationTargets('mkdir -p a/{b,c}', 'bash', SCRATCH).length === 2);
  check('creation: -- ends the options of mkdir', creationTargets('mkdir -- -odd', 'bash', SCRATCH).length === 1);
  check('creation: md creates like mkdir', creationTargets('md newdir', 'bash', SCRATCH).length === 1);
  check('creation: New-Item -Path with -Name joins them', names(creationTargets('New-Item -Path d -Name n -ItemType File', 'powershell', SCRATCH)).join() === 'n');
  check('creation: New-Item with only -Name creates under the working directory', creationTargets('New-Item -Name n', 'powershell', SCRATCH)[0]?.path === path.join(SCRATCH, 'n'));
  check('creation: New-Item with a positional path and -ItemType', names(creationTargets('New-Item -ItemType Directory dd', 'powershell', SCRATCH)).join() === 'dd');
  check('creation: ni is an alias of New-Item', creationTargets('ni -Path x', 'powershell', SCRATCH).length === 1);
  check('creation: New-Item with two names creates both', creationTargets('New-Item -Path d -Name a', 'powershell', SCRATCH).length === 1);
  check('creation: a command that does not create creates nothing', creationTargets('ls -la', 'bash', SCRATCH).length === 0);
  check('creation: a variable target is not guessed', creationTargets('mkdir "$X"', 'bash', SCRATCH).length === 0);

  check('linkedWorktreeRoot: a linked worktree from a subfolder', linkedWorktreeRoot(path.join(worktree, 'src', 'sub')) === worktree);
  check('linkedWorktreeRoot: the main checkout has no own tree', linkedWorktreeRoot(path.join(mainCheckout, 'src')) === undefined);
  check('linkedWorktreeRoot: outside every repository there is none', linkedWorktreeRoot(path.parse(ROOT).root) === undefined);

  const noCwdLine = JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo x > rel.txt' } }] } });
  const withCwdLine = JSON.stringify({ cwd: SCRATCH, message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo x > rel.txt' } }] } });

  check('authorship: a record with no cwd resolves against the fallback', authoredPathsIn(noCwdLine, ROOT)[0] === path.join(ROOT, 'rel.txt'));
  check('authorship: a record\'s own cwd beats the fallback', authoredPathsIn(withCwdLine, ROOT)[0] === path.join(SCRATCH, 'rel.txt'));
  check('authorship: a text block that merely looks like a call authors nothing', !authoredPathsIn(historyText, SCRATCH).some((file) => file.endsWith('contrast.mjs')));

  // --- cases found by the mutation campaign --------------------------------------------------------------
  expect('allow', pwsh(`rm -WhatIf '${at('provision.mjs')}'`), 'the rm alias of PowerShell is read with PowerShell grammar: -WhatIf deletes nothing');
  expect('allow', pwsh(`rm -Path '${at('mine.mjs')}' -ErrorAction Stop`), 'the rm alias with a value parameter');
  expect('allow', bash(`echo x > ${p('same-call.txt')} && rm ${p('same-call.txt')}`), 'a file that exists and is written and removed in the same call');
  expect('deny', bash(`rm ${p('same-call.txt')}`), 'the same file when this call does not write it');
  expect('allow', bash(`rm -rf ${p('casedir')}`), 'an authored file under a name with capitals, found by its folded spelling');
  check('targets: a two-letter word that is not a slash flag is an operand', targetsOf('del ab').length === 1);
  check('wildcard: a star retries from the start of its run', wildcardMatch('*ab', 'aab') && wildcardMatch('a*b*c', 'aXbXbXc'));
  check('expandPath: a plain file where a folder is expected does not stop the others', expandPath(path.join(ROOT, '*', 'prov*.mjs')).some((file) => file.endsWith('provision.mjs')));

  const listed = [];
  const countingList = (directory, options) => {
    listed.push(directory);

    return readdirSync(directory, options);
  };

  foreignLeaves(at('nested'), ownershipOf([], undefined), 1, countingList);
  check('foreignLeaves: the walk stops as soon as the budget is spent', listed.length === 2, `${listed.length} folders read`);

  const unreadable = foreignLeaves(at('shared'), ownershipOf([], undefined), 100, () => {
    throw new Error('EACCES');
  });

  check('foreignLeaves: a folder that cannot be listed is foreign', unreadable.foreign.length === 1 && unreadable.foreign[0] === at('shared'));

  const manyForeignText = reasonOf(bash(`rm ${p('*.mjs')}`));

  check('refusal: the count is the files reached, not the files listed', manyForeignText.includes('7 file(s)') && manyForeignText.includes('7 fichero(s)'), manyForeignText);
  check('refusal: git quoted names are read as they are (quotePath off)', reasonOf(inRepo('git clean -f', repo)).includes('ñandú.tmp'));
  check('refusal: the folder reason is worded', reasonOf(bash('cd "$X" && rm a')).includes('the folder it runs in') && reasonOf(bash('cd "$X" && rm a')).includes('la carpeta en la que corre'));
  check('refusal: the preview reason is worded', reasonOf(inRepo('git clean -f', path.join(ROOT, 'not-a-repo'))).includes('git clean could not list') && reasonOf(inRepo('git clean -f', path.join(ROOT, 'not-a-repo'))).includes('git clean no pudo listar'));
  check('refusal: the variable reason is worded', reasonOf(bash('rm "$X"')).includes('depends on a variable') && reasonOf(bash('rm "$X"')).includes('depende de una variable'));

  // --- the authorship of the transcript ---------------------------------------------------------------
  const authored = authoredPathsIn(historyText, SCRATCH).map((file) => path.basename(file));

  check('authorship: Write, a redirect, mkdir and cp are authored', ['mine.mjs', 'mine.txt', 'work', 'copied', 'y.txt'].every((name) => authored.includes(name)), authored.join());
  check('authorship: Edit, sed -i, Read and cat are not', !authored.includes('chain-edited.mjs') && !authored.includes('sedded.mjs') && !authored.includes('provision.mjs') && !authored.includes('contrast.mjs'), authored.join());
  check('authorship: a half-written last line does not hide what came before', authored.includes('mine.mjs'));
  check('authorship: records without a tool call add nothing', authoredPathsIn('{"type":"user","message":{"content":"hi"}}\n', SCRATCH).length === 0);

  const ownership = ownershipOf(authoredPathsIn(historyText, SCRATCH), undefined);

  check('ownership: an authored file is owned', ownership.owns(at('mine.mjs')));
  check('ownership: something under an authored folder is owned', ownership.owns(at('work', 'deep', 'built.bin')));
  check('ownership: a sibling that only shares a prefix is not owned', !ownership.owns(`${at('mine.mjs')}x`) && !ownership.owns(at('mine.mjs.bak')));
  check('ownership: a foreign file is not owned', !ownership.owns(at('provision.mjs')));
  check('ownership: the scratchpad root is not owned, a subfolder the agent made is', !ownership.owns(SCRATCH) && ownership.owns(at('mydir', 'anything.log')));
  check('ownership: a file directly in the scratchpad root is not owned by default', !ownership.owns(at('lonely.log')));
  check('ownership: writing a file INTO a folder does not make the folder the agent\'s', ownership.owns(at('shared', 'y.txt')) && !ownership.owns(at('shared', 'x.txt')) && !ownership.owns(at('shared')));
  check('ownership: the own worktree is owned when given', ownershipOf([], path.join(ROOT, 'worktree')).owns(path.join(ROOT, 'worktree', 'a', 'b.ts')));

  // --- the shape of the output ------------------------------------------------------------------------
  const foreignText = reasonOf(bash(`rm -f ${p('provision.mjs')} ${p('contrast.mjs')}`));
  const spanishAt = foreignText.indexOf('  @es ');
  const [english, spanish] = [foreignText.slice(0, spanishAt), foreignText.slice(spanishAt)];

  check('refusal event is PreToolUse, decision deny', evaluate(JSON.stringify(bash(`rm ${p('provision.mjs')}`)))?.hookSpecificOutput?.hookEventName === 'PreToolUse');
  check('refusal is bilingual: English then " @es " Spanish', foreignText.includes('REFUSED') && spanishAt > foreignText.indexOf('REFUSED'));
  check('refusal keeps the Spanish accents', spanish.includes('RECHAZÓ') && spanish.includes('sesión'));

  for (const [name, half] of [['English', english], ['Spanish', spanish]]) {
    check(`refusal names every foreign file in the ${name} half`, half.includes('provision.mjs') && half.includes('contrast.mjs'));
    check(`refusal names the command in the ${name} half`, half.includes('rm'));
    check(`refusal does not name an own file in the ${name} half`, !half.includes('mine.mjs'));
  }

  check('refusal says to leave foreign files alone (English)', english.includes('LEAVE THEM ALONE'));
  check('refusal says to leave foreign files alone (Spanish)', spanish.includes('DEJAR ESOS FICHEROS EN PAZ'));
  check('refusal names the remedy: own scratchpad subfolder', english.includes('<scratchpad>/<your-name>/') && spanish.includes('<scratchpad>/<tu-nombre>/'));
  check('refusal names the measured incident', english.includes('2026-10-19') && english.includes('provision.mjs') && spanish.includes('2026-10-19'));
  const spanishWords = spanish.split(' ').map((token) => [...token].filter((character) => character.toLowerCase() !== character.toUpperCase()).join('').toLowerCase());

  check('Spanish half is neutral (no voseo)', !['hacé', 'dejá', 'usá', 'pedí', 'tenés', 'podés', 'nombrá', 'escribí', 'creá'].some((word) => spanishWords.includes(word)));

  const manyForeign = reasonOf(bash(`rm ${p('*.mjs')}`));

  check('refusal caps a long list and counts it', manyForeign.includes('(showing 5)') && manyForeign.includes('(se muestran 5)'), manyForeign);

  const variableText = reasonOf(bash('rm "$X/a"'));

  check('unresolvable refusal says why, in both languages', variableText.includes('cannot tell') && variableText.includes('no se puede saber') && variableText.includes('variable'), variableText);
  check('unresolvable refusal for stdin says why', reasonOf(bash('ls | xargs rm')).includes('standard input') && reasonOf(bash('ls | xargs rm')).includes('entrada estándar'));
  check('unresolvable refusal for the pipeline says why', reasonOf(pwsh('Get-ChildItem | Remove-Item')).includes('pipeline') && reasonOf(pwsh('Get-ChildItem | Remove-Item')).includes('canalización'));
  check('unresolvable refusal for an unknowable folder says why', reasonOf(bash('cd "$X" && rm a')).includes('folder') && reasonOf(bash('cd "$X" && rm a')).includes('carpeta'));
  check('unresolvable refusal for a git clean preview says why', reasonOf(inRepo('git clean -f', path.join(ROOT, 'not-a-repo'))).includes('git clean') && reasonOf(inRepo('git clean -f', path.join(ROOT, 'not-a-repo'))).includes('git'));
  check('the message table has no bilingual problems', messageProblems(MESSAGES).length === 0, messageProblems(MESSAGES).join('; '));

  /** The verdict when the decision throws; a throw that escapes is a failed check. @es El veredicto cuando la decisión lanza. */
  function verdictWhenDecisionThrows() {
    try {
      return evaluate(JSON.stringify(bash(`rm ${p('provision.mjs')}`)), { judge: () => { throw new Error('boom'); } });
    } catch (error) {
      return { escaped: error.message };
    }
  }

  check('an internal failure of the decision fails open', verdictWhenDecisionThrows() === undefined);

  // --- the shim: the real process, stdin in, stdout out ------------------------------------------------
  const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', windowsHide: true });
  const viaShim = run(JSON.stringify(bash(`rm ${p('provision.mjs')}`)));
  const viaShimMain = run(JSON.stringify(asMain('Bash', { command: `rm ${p('provision.mjs')}` })));
  const viaShimQuiet = run(JSON.stringify(bash(`rm ${p('mine.mjs')}`)));

  check('shim: a delegated rm of a foreign file is denied on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"permissionDecision":"deny"'), viaShim.stderr);
  check('shim: the main session prints nothing, exit 0', viaShimMain.status === 0 && viaShimMain.stdout === '');
  check('shim: a delegated rm of an own file prints nothing, exit 0', viaShimQuiet.status === 0 && viaShimQuiet.stdout === '');
} finally {
  // The junction goes first and alone: removing a junction removes the link, never what it points at.
  try {
    rmdirSync(at('holder', 'lnk'));
  } catch {
    // already gone
  }

  rmSync(ROOT, { recursive: true, force: true });
}

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
