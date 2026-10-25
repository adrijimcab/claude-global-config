#!/usr/bin/env node
/**
 * Self-test for foreign-delete-guard (third occurrence 2026-10-19 of worker-temp-file-collided-across-sessions:
 * writers told to "delete the scratch scripts after" removed the orchestrator's provision.mjs, engram-save.mjs,
 * mirror-odd.mjs, split-backlog.mjs and contrast.mjs from the shared session scratchpad root).
 *
 * EVERYTHING RUNS ON REAL FOLDERS AND REAL EFFECTS. A session-tree-shaped directory under `<tmp>/claude/` holds
 * the orchestrator's files and the files the delegated agent makes. The agent "makes" a file the way it does in a
 * session: its call reaches the guard while the file is absent (that is when the guard journals it, in an isolated
 * state folder), and only then does the file appear. Globs are expanded by the real file system and `git clean`
 * runs in a real throwaway repository.
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - WHO CALLS: a subagent (by `agent_id`, by transcript file name), the main session (never judged), a subagent
 *     that cannot be told apart (not judged).
 *   - WHAT DELETES: rm, rmdir, unlink, del, erase, rd, Remove-Item and its aliases, git clean, find -delete /
 *     -exec (also through sh -c, env, sudo), xargs rm, a nested shell, a nested cmd /c, a wrapper prefix.
 *   - WHAT IS NAMED: an own file, a foreign file, a glob over both, a brace list, a folder holding a foreign file,
 *     a folder the agent made, a file a child process dropped in it, a file that does not exist, a variable, a
 *     command substitution, the pipeline, Git Bash /tmp.
 *   - HOW AUTHORED, BY EFFECT: a Write, a redirect, mkdir, New-Item, cp into a folder; NOT authored: anything that
 *     already existed when the call was made, whatever the command says (mkdir -p on a shared folder, touch on
 *     its files, an append, cp into an existing folder or into `.`, a Write over a foreign file), an Edit, a sed
 *     -i, a Read, a creation AFTER or in the SAME line as the deletion, a path whose birth predates its record.
 *   - TENANCY: the worktree the harness record or the brief gives the agent; no record, another actor's worktree,
 *     a submodule, a main checkout, a `.git` file pointing elsewhere.
 *   - LINKS: a junction inside a folder the agent owns, to a target it owns and to one it does not.
 *   - THE SHAPE OF THE OUTPUT: bilingual, names the foreign files and says to leave them alone.
 *
 * @es Auto-test del foreign-delete-guard. Todo corre sobre carpetas y efectos reales: el agente "hace" un fichero
 * como en una sesión (su llamada llega al guard con el fichero ausente, y entonces se anota en un estado aislado;
 * después aparece el fichero). Estados: quién llama, qué borra, qué nombra, cómo se autoró POR EFECTO (lo que ya
 * existía al llamar nunca es del agente, diga lo que diga el comando), la tenencia, los enlaces y la forma de la salida.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { isolateState, stateDir } from '../hook-state/locations.mjs';
import { canonical } from '../shared-temp-guard/shared-temp-targets.mjs';
import { agentKeyOf, BIRTH_TOLERANCE_MS, bornAt, readCreations, recordCreations, vouchedFor } from './authored-journal.mjs';
import { creationsOfCall, ownershipOf, pendingCreations } from './authorship.mjs';
import { creationTargets } from './creation-targets.mjs';
import { deletionTargets, previewFrom } from './deletion-targets.mjs';
import { foreignLeaves } from './foreign-paths.mjs';
import { evaluate } from './guard.mjs';
import { judgeDeletion } from './judge.mjs';
import { linkedWorktreeRoot, tenancyWorktree } from './own-tree.mjs';
import { MESSAGES, refusalText } from './refusal.mjs';
import { braceExpansion, expandPath, wildcardMatch } from './wildcards.mjs';

isolateState('fdg');

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
const TMP_FILE = path.join(os.tmpdir(), `fdg-selftest-tmp-${process.pid}.txt`);
const slashes = (value) => value.split('\\').join('/');
const gitBash = (value) => `/${value.charAt(0).toLowerCase()}${slashes(value).slice(2)}`;
const links = [];

/** A file on disk, with its folder. @es Un fichero en disco, con su carpeta. */
function put(file, content = 'x') {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);

  return file;
}

/** A junction (a symlink where junctions do not exist) that the cleanup removes first. @es Una junction que la limpieza quita primero. */
function link(target, where) {
  mkdirSync(path.dirname(where), { recursive: true });
  symlinkSync(target, where, 'junction');
  links.push(where);
}

const at = (...parts) => path.join(SCRATCH, ...parts);

/** A delegated agent's call. @es Una llamada de un agente delegado. */
const asAgent = (tool, input, extra = {}) => ({ tool_name: tool, tool_input: input, cwd: SCRATCH, session_id: 's', agent_id: 'abc', transcript_path: TRANSCRIPT, ...extra });

/** The main session's call. @es Una llamada de la sesión principal. */
const asMain = (tool, input) => ({ tool_name: tool, tool_input: input, cwd: SCRATCH, session_id: 's', transcript_path: MAIN_TRANSCRIPT });

const verdictOf = (payload, deps) => evaluate(JSON.stringify(payload), deps)?.hookSpecificOutput?.permissionDecision;
const reasonOf = (payload, deps) => evaluate(JSON.stringify(payload), deps)?.hookSpecificOutput?.permissionDecisionReason ?? '';

function expect(verdict, payload, label, deps) {
  const actual = verdictOf(payload, deps);

  check(`${verdict}: ${label}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

const bash = (command) => asAgent('Bash', { command });
const pwsh = (command) => asAgent('PowerShell', { command });
const p = (...parts) => slashes(at(...parts));
const upperDrive = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/** The agent's call reaches the guard while `files` are absent, then they appear: how a session makes a file. @es La llamada llega con los ficheros ausentes y luego aparecen. */
function announce(payload, ...effects) {
  evaluate(JSON.stringify(payload));

  for (const effect of effects) {
    if (effect.endsWith('/')) mkdirSync(effect, { recursive: true });
    else put(effect);
  }
}

const agentWrites = (file) => announce(asAgent('Write', { file_path: file, content: 'x' }), file);

try {
  // THE ORCHESTRATOR'S AND OTHER ACTORS' FILES: they exist before the agent does anything.
  for (const name of ['provision.mjs', 'engram-save.mjs', 'mirror-odd.mjs', 'split-backlog.mjs', 'contrast.mjs']) put(at(name));

  put(at('shared', 'x.txt'));
  put(at('emptyforeign', 'keep'));
  put(at('chain-edited.mjs'));
  put(at('sedded.mjs'));
  put(at('br[1].txt'));
  put(at('fb{x,y}.txt'));
  put(at('nested', 'a', 'b', 'f.txt'));
  put(at('same-call.txt'));
  put(at('holder', 'hf.txt'));
  put(at('dropdir', 'other.txt'));
  put(at('dropdir2', 'other.txt'));
  put(path.join(ROOT, 'afile.txt'));
  put(path.join(ROOT, 'outside', 'outside-file.txt'));
  put(TMP_FILE);
  mkdirSync(at('emptydir'), { recursive: true });
  link(path.join(ROOT, 'outside'), at('holder', 'lnk'));

  // WHAT THE AGENT MAKES, each announced while absent and then appearing.
  agentWrites(at('mine.mjs'));
  agentWrites(at('mine-too.mjs'));
  announce(bash(`echo hi > ${p('mine.txt')}`), at('mine.txt'));
  announce(pwsh(`New-Item -ItemType Directory -Path '${at('mydir')}'`), `${at('mydir')}/`);
  agentWrites(at('mydir', 'a.txt'));
  put(at('mydir', 'out.log')); // dropped by a child process inside the folder the agent made
  announce(bash(`mkdir -p ${p('work')}`), `${at('work')}/`);
  put(at('work', 'built.bin')); // dropped by a child process inside the folder the agent made
  agentWrites(at('shared', 'y.txt'));
  announce(bash(`cp -r src ${p('copied')}`), `${at('copied')}/`);
  put(at('copied', 'z.txt'));
  agentWrites(at('tick`x.txt'));
  agentWrites(at('casedir', 'Upper.TXT'));
  announce(bash(`cp ${p('mine.mjs')} ${p('dropdir')}/`), at('dropdir', 'mine.mjs'));
  announce(asAgent('Bash', { command: `cp ${p('mine.mjs')} .` }, { cwd: at('dropdir2') }), at('dropdir2', 'mine.mjs'));
  announce(bash(`mkdir ${p('linkdir')} ${p('linkdir2')}`), `${at('linkdir')}/`, `${at('linkdir2')}/`);
  link(path.join(ROOT, 'outside'), at('linkdir', 'out'));
  link(at('mydir'), at('linkdir2', 'in'));
  link(at('mydir'), at('holder', 'lnk-owned')); // a link in a foreign folder, to a target the agent owns
  announce(bash(`mkdir ${p('ownempty')}`), `${at('ownempty')}/`);

  // WHAT THE AGENT MERELY NAMES, all of it existing when the call is made: none of it may claim anything.
  announce(asAgent('Edit', { file_path: at('chain-edited.mjs'), old_string: 'a', new_string: 'b' }));
  announce(bash(`sed -i s/a/b/ ${p('sedded.mjs')}`));
  announce(bash(`mkdir -p ${p('')}`));
  announce(bash(`touch ${p('*.mjs')}`));
  announce(bash(`cp ${p('mine.mjs')} ${p('')}/`));
  announce(bash(`echo more >> ${p('provision.mjs')}`));
  announce(asAgent('Write', { file_path: at('contrast.mjs'), content: 'x' }));
  announce(asAgent('Read', { file_path: at('engram-save.mjs') }));
  announce(bash(`cat ${p('mirror-odd.mjs')}`));

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
  expect('allow', asMain('Bash', { command: `rm ${p('provision.mjs')}` }), 'the orchestrator deleting a file (never judged)');
  expect('allow', asMain('Bash', { command: 'rm "$X"' }), 'the orchestrator through a variable');
  expect('deny', { ...bash(`rm ${p('provision.mjs')}`), agent_id: undefined, transcript_path: TRANSCRIPT }, 'a subagent known only by its transcript file name');
  expect('deny', { ...bash(`rm ${p('provision.mjs')}`), transcript_path: MAIN_TRANSCRIPT }, 'a subagent whose payload carries the MAIN transcript is judged by its own agent id');

  // --- the bypasses the judges named: a command that merely NAMES an existing path claims nothing -------
  expect('deny', bash(`rm ${p('provision.mjs')}`), 'after mkdir -p on the existing scratchpad, the scratchpad is still not the agent\'s');
  expect('deny', bash(`rm ${p('engram-save.mjs')}`), 'after touch on the scratchpad\'s *.mjs, they are still not the agent\'s');
  expect('deny', bash(`rm ${p('mirror-odd.mjs')}`), 'after cp into the existing scratchpad folder, its files are still not the agent\'s');
  expect('allow', bash(`rm ${p('dropdir', 'mine.mjs')}`), 'the file a cp dropped into an existing folder IS the agent\'s (dest/basename(src))');
  expect('deny', bash(`rm -rf ${p('dropdir')}`), 'the existing folder a cp dropped a file into is not the agent\'s');
  expect('allow', bash(`rm ${p('dropdir2', 'mine.mjs')}`), 'the file a cp dropped into `.` IS the agent\'s');
  expect('deny', bash(`rm -rf ${p('dropdir2')}`), 'cp into `.` does not claim the working directory');
  expect('deny', bash(`rm ${p('provision.mjs')} ${p('mine.mjs')}`), 'an append to an existing file does not claim it');
  expect('deny', bash(`rm ${p('contrast.mjs')}`), 'a Write over a foreign file does not claim it (the call may be denied or fail)');
  expect('deny', bash(`rm ${p('chain-edited.mjs')}`), 'a file the agent only edited was not created by it');
  expect('deny', bash(`rm ${p('sedded.mjs')}`), 'a file the agent only ran sed -i on was not created by it');
  expect('deny', bash(`rm ${p('engram-save.mjs')}`), 'a file the agent only read');
  expect('deny', bash(`rm ${p('provision.mjs')}; mkdir -p ${p('after-the-delete')}`), 'a creation AFTER the deletion in the same line authorizes nothing');
  expect('deny', bash(`rm ${p('provision.mjs')} && touch ${p('provision.mjs')}`), 'recreating the file after deleting it does not make it the agent\'s');
  expect('deny', bash(`echo x > ${p('same-call.txt')} && rm ${p('same-call.txt')}`), 'a file that exists, written in the SAME line as the deletion, is still not the agent\'s');
  expect('allow', bash(`mkdir ${p('fresh')} && touch ${p('fresh', 'f.txt')} && rm -rf ${p('fresh')}`), 'a folder made and removed in one line deletes nothing that exists');
  expect('allow', bash(`echo x > ${p('brand-new.txt')} && rm ${p('brand-new.txt')}`), 'a file that does not exist yet deletes nothing');

  // --- by effect: the birth time of the file decides ---------------------------------------------------
  const foreignCanonical = canonical(at('provision.mjs'));
  const born = bornAt(foreignCanonical);

  recordCreations('timing', [foreignCanonical], born + 3_600_000);
  expect('deny', { ...bash(`rm ${p('provision.mjs')}`), agent_id: 'timing' }, 'a record newer than the file\'s birth does not vouch for it');

  recordCreations('timing2', [foreignCanonical], born - 3_600_000);
  expect('allow', { ...bash(`rm ${p('provision.mjs')}`), agent_id: 'timing2' }, 'a record older than the file\'s birth vouches for it');

  recordCreations('timing3', [foreignCanonical], born + BIRTH_TOLERANCE_MS - 100);
  expect('allow', { ...bash(`rm ${p('provision.mjs')}`), agent_id: 'timing3' }, 'a birth within the clock tolerance before the record still counts');

  recordCreations('timing4', [foreignCanonical], born + BIRTH_TOLERANCE_MS + 100);
  expect('deny', { ...bash(`rm ${p('provision.mjs')}`), agent_id: 'timing4' }, 'a birth beyond the clock tolerance before the record does not count');

  // --- who is judged and the failure modes -----------------------------------------------------------
  expect('allow', { ...bash(`rm ${p('provision.mjs')}`), agent_id: undefined, transcript_path: path.join(ROOT, 'session', 'subagents', 'nope.jsonl') }, 'a subagent that cannot be told apart is not judged');
  expect('deny', { ...bash('rm "$X"'), agent_id: undefined, transcript_path: path.join(ROOT, 'session', 'subagents', 'nope.jsonl') }, 'an unresolvable target is refused even when the agent cannot be told apart');
  expect('deny', { ...bash(`rm ${p('provision.mjs')}`), agent_id: 'never-journaled' }, 'an agent with an empty journal owns nothing');
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
    ['cmd /c del with its flags and forward slashes', `cmd /c del /f /q ${p('provision.mjs')}`],
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

  // --- Git Bash /tmp and a nested cmd /c ---------------------------------------------------------------
  expect('deny', bash(`rm /tmp/${path.basename(TMP_FILE)}`), 'Git Bash /tmp is the real temp folder, not C:\\tmp');
  expect('deny', bash(`rm -f /tmp/fdg-*-tmp-${process.pid}.txt`), 'a glob under Git Bash /tmp');
  expect('allow', bash(`rm /tmp/fdg-selftest-never-existed-${process.pid}.txt`), 'a file that exists in neither spelling deletes nothing');
  expect('deny', bash(`cmd /c del ${SCRATCH}\\*.mjs`), 'a nested cmd /c del with a backslash path cannot be located (refused as unresolvable)');
  expect('deny', bash(`cmd /c rd /s /q ${at('shared')}`), 'a nested cmd /c rd with a backslash path');
  check('the cmd backslash refusal names its reason in both languages', reasonOf(bash(`cmd /c del ${SCRATCH}\\*.mjs`)).includes('loses the backslashes') && reasonOf(bash(`cmd /c del ${SCRATCH}\\*.mjs`)).includes('pierde las barras invertidas'));
  expect('allow', bash('cmd /c echo hello\\there'), 'a nested cmd /c that deletes nothing is not refused for its backslash');

  // --- globs, brace lists, directories ---------------------------------------------------------------
  expect('deny', bash(`rm ${p('mine.{mjs,txt}')} ${p('provision.mjs')}`), 'a brace list beside a foreign file');
  expect('allow', bash(`rm ${p('mine.{mjs,txt}')}`), 'a brace list of own files');
  expect('deny', bash(`rm ${p('{mine,provision}.mjs')}`), 'a brace list reaching a foreign file');
  expect('deny', bash(`rm ${p('x{1..3}.mjs')}`), 'a brace range cannot be known before it runs');
  expect('deny', bash(`rm ${p('mine.m?s')} ${p('prov[a-z]*.mjs')}`), 'a ? and a [range] glob reaching a foreign file');
  expect('allow', bash(`rm ${p('mine.m?s')}`), 'a ? glob over own files only');
  expect('allow', bash(`rm ${p('mine.[mt][jx][st]')}`), 'a [class] glob over own files only');
  expect('allow', bash(`rm -rf ${p('work')}`), 'a folder the agent made, with a file a child process dropped in it');
  expect('allow', bash(`rm -rf ${p('mydir')}`), 'the agent\'s own scratchpad subfolder (made with New-Item), with a file a child process dropped in it');
  expect('allow', bash(`rm ${p('mydir', 'out.log')}`), 'a child process\'s file inside the agent\'s own scratchpad subfolder');
  expect('allow', bash(`rm ${p('mydir', '*')}`), 'a glob inside the agent\'s own scratchpad subfolder');
  expect('deny', bash(`rm -rf ${p('shared')}`), 'a folder holding a foreign file');
  expect('allow', bash(`rm ${p('shared', 'y.txt')}`), 'the one authored file of a mixed folder');
  expect('deny', bash(`rm ${p('shared', '*')}`), 'a glob over a mixed folder');
  expect('deny', bash(`rm -rf ${p('emptyforeign')}`), 'a foreign folder the agent did not make');
  expect('allow', bash(`rm -rf ${p('copied')}`), 'the destination of a cp -r the agent ran');

  // --- find, xargs, pipelines ------------------------------------------------------------------------
  expect('deny', bash(`find ${p('')} -name '*.mjs' -delete`), 'find -delete over a folder with foreign files');
  expect('allow', bash(`find ${p('mydir')} -name '*.log' -delete`), 'find -delete inside the agent\'s own subfolder');
  expect('deny', bash(`find ${p('')} -name '*.mjs' -exec rm {} \\;`), 'find -exec rm over a folder with foreign files');
  expect('allow', bash(`find ${p('mydir')} -type f -exec rm {} +`), 'find -exec rm inside the agent\'s own subfolder');
  expect('deny', bash(`find ${p('')} -name '*.mjs' -exec sh -c 'rm "$0"' {} \\;`), 'find -exec through sh -c');
  expect('deny', bash(`find ${p('')} -name '*.mjs' -exec env rm {} \\;`), 'find -exec through env');
  expect('deny', bash(`find ${p('')} -name '*.mjs' -exec sudo rm {} +`), 'find -exec through sudo');
  expect('allow', bash(`find ${p('')} -name '*.mjs' -exec echo {} ;`), 'find -exec of a command that does not delete');
  expect('allow', bash(`find ${p('')} -name '*.mjs' -exec grep rm {} +`), 'find -exec grep mentioning rm is not a deletion');
  expect('allow', bash(`find ${p('')} -name '*.mjs'`), 'find without a deleting action');
  expect('deny', bash('ls | xargs rm'), 'xargs rm: the operands arrive on stdin');
  expect('deny', bash(`find ${p('mydir')} -name '*.log' | xargs -0 -n 5 rm -f`), 'xargs with options before rm');
  expect('deny', bash('cat list.txt | xargs -I{} rm {}'), 'xargs -I rm');
  expect('deny', bash('cat list.txt | xargs sh -c "rm {}"'), 'xargs through a shell');
  expect('deny', bash('xargs env rm'), 'xargs through a wrapper prefix');
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
  expect('allow', bash('powershell -Command "Remove-Item -WhatIf ' + p('provision.mjs') + '"'), 'a nested PowerShell Remove-Item -WhatIf under Bash');
  expect('allow', bash('pwsh -c "ri -WhatIf ' + p('provision.mjs') + '"'), 'the ri alias -WhatIf in a nested shell');
  expect('allow', pwsh(`Remove-Item -LiteralPath '${at('mine.mjs')}'`), 'Remove-Item -LiteralPath of an own file');
  expect('allow', pwsh(`Remove-Item -Path:'${at('mine.mjs')}'`), 'Remove-Item -Path:value of an own file');
  expect('allow', pwsh(`Remove-Item -wi '${at('provision.mjs')}'`), 'the -wi alias of -WhatIf');
  expect('allow', pwsh(`rm -WhatIf '${at('provision.mjs')}'`), 'the rm alias of PowerShell is read with PowerShell grammar: -WhatIf deletes nothing');
  expect('allow', pwsh(`rm -Path '${at('mine.mjs')}' -ErrorAction Stop`), 'the rm alias with a value parameter');

  // --- git clean -------------------------------------------------------------------------------------
  const repo = path.join(ROOT, 'repo');
  const repoMine = path.join(ROOT, 'repo-mine');

  for (const dir of [repo, repoMine]) {
    mkdirSync(dir, { recursive: true });
    spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', windowsHide: true });
  }

  put(path.join(repo, 'foreign.tmp'));
  put(path.join(repo, 'ñandú.tmp')); // git quotes a name like this unless told not to
  mkdirSync(path.join(ROOT, 'not-a-repo'), { recursive: true });

  const inRepo = (command, cwd) => asAgent('Bash', { command }, { cwd });
  const inRepoWrite = (file, cwd) => announce(asAgent('Write', { file_path: file, content: 'x' }, { cwd }), file);

  inRepoWrite(path.join(repo, 'mine.tmp'), repo);
  inRepoWrite(path.join(repoMine, 'mine.tmp'), repoMine);
  inRepoWrite(path.join(repoMine, '-if.tmp'), repoMine); // a pathspec that looks like clean options

  expect('deny', inRepo('git clean -f', repo), 'git clean over a repository holding a foreign untracked file');
  expect('deny', inRepo('git clean -fd', repo), 'git clean -fd');
  expect('deny', inRepo('git clean -fdx', repo), 'git clean -fdx');
  expect('deny', inRepo(`git -C ${slashes(repo)} clean -f`, ROOT), 'git -C <repo> clean -f from another folder');
  expect('deny', inRepo('git clean -f -- foreign.tmp', repo), 'git clean -f of a named foreign file');
  expect('allow', inRepo('git clean -f -- mine.tmp', repo), 'git clean -f of a named own file');
  expect('allow', inRepo('git clean -f', repoMine), 'git clean over a repository whose only untracked files are own');
  expect('allow', inRepo('git clean -n', repo), 'git clean -n lists and deletes nothing');
  expect('allow', inRepo('git clean -fn', repo), 'git clean -fn (dry run in a cluster)');
  expect('allow', inRepo('git clean --dry-run -f', repo), 'git clean --dry-run');
  expect('allow', inRepo('git status', repo), 'another git command');
  expect('allow', inRepo('git clean -f -- -if.tmp', repoMine), 'a pathspec that looks like clean options is passed through untouched after --');
  expect('deny', inRepo('git clean -f -enode_modules', repo), 'an exclude pattern glued to -e is not read as the dry-run flag');
  check('git clean -fdi previews without the interactive flag and names the foreign file', reasonOf(inRepo('git clean -fdi', repo)).includes('foreign.tmp'));
  expect('deny', inRepo('git clean -f', path.join(ROOT, 'not-a-repo')), 'git clean where git cannot list what it would remove');

  // --- the worktree the agent was given ----------------------------------------------------------------
  const mainRepo = path.join(ROOT, 'mainrepo');
  const worktree = path.join(ROOT, 'wt-mine');
  const otherWorktree = path.join(ROOT, 'wt-other');
  const submodule = path.join(ROOT, 'sub');
  const mainCheckout = path.join(ROOT, 'maincheckout');
  const brief = (text) => put(path.join(ROOT, 'briefs', `${Math.random().toString(36).slice(2)}.jsonl`), `${JSON.stringify({ message: { content: text } })}\n`);

  mkdirSync(path.join(mainRepo, '.git', 'worktrees'), { recursive: true });
  put(path.join(worktree, '.git'), `gitdir: ${slashes(mainRepo)}/.git/worktrees/wt-mine`);
  put(path.join(otherWorktree, '.git'), `gitdir: ${slashes(mainRepo)}/.git/worktrees/wt-other`);
  put(path.join(submodule, '.git'), 'gitdir: ../.git/modules/sub');

  const noPrefix = path.join(ROOT, 'wt-noprefix');
  const backslashed = path.join(ROOT, 'wt-backslash');

  put(path.join(noPrefix, '.git'), `${slashes(mainRepo)}/.git/worktrees/wt-noprefix`);
  put(path.join(backslashed, '.git'), `gitdir: ${mainRepo}\\.git\\worktrees\\wt-backslash`);
  put(path.join(mainCheckout, 'src', 'x.ts'));
  mkdirSync(path.join(mainCheckout, '.git'), { recursive: true });

  for (const tree of [worktree, otherWorktree, submodule]) {
    put(path.join(tree, 'src', 'old.ts'));
    put(path.join(tree, 'src', 'sub', 'dir', 'deep.ts'));
  }

  const inTree = (tree, command, subfolder = '') => asAgent('Bash', { command }, { cwd: path.join(tree, subfolder) });
  const harness = (tree) => () => [{ id: 'agent-abc', worktreePath: tree, transcript: path.join(ROOT, 'none.jsonl') }];
  const byBrief = (text) => () => [{ id: 'agent-abc', worktreePath: '', transcript: brief(text) }];
  const rmOld = (tree) => `rm ${slashes(path.join(tree, 'src', 'old.ts'))}`;

  expect('allow', inTree(worktree, rmOld(worktree)), 'a file inside the worktree the harness record gives the agent', { records: harness(worktree) });
  expect('allow', inTree(worktree, 'rm -rf src/sub', 'src'), 'a relative folder inside the agent\'s tenancy worktree, from a subfolder', { records: harness(worktree) });
  expect('allow', inTree(worktree, rmOld(worktree)), 'a file inside the worktree its brief declares as TENANCY', { records: byBrief(`TENANCY: ${slashes(worktree)}\nDo the work.`) });
  expect('deny', inTree(worktree, rmOld(worktree)), 'no record of the agent: no exemption', { records: () => [] });
  expect('deny', inTree(worktree, rmOld(worktree)), 'a record of ANOTHER agent gives this one nothing', { records: () => [{ id: 'agent-zzz', worktreePath: worktree, transcript: path.join(ROOT, 'none.jsonl') }] });
  expect('deny', inTree(worktree, rmOld(worktree)), 'the harness gives the agent another worktree', { records: harness(otherWorktree) });
  expect('deny', inTree(otherWorktree, rmOld(otherWorktree)), 'another actor\'s worktree is not the agent\'s tenancy', { records: harness(worktree) });
  expect('deny', inTree(worktree, rmOld(worktree)), 'a brief that declares a different worktree', { records: byBrief(`TENANCY: ${slashes(otherWorktree)}`) });
  expect('deny', inTree(worktree, rmOld(worktree)), 'a brief with no TENANCY line', { records: byBrief('Please tidy the repository.') });
  expect('deny', inTree(worktree, rmOld(worktree)), 'a brief claim is ignored when the harness names a worktree', { records: () => [{ id: 'agent-abc', worktreePath: otherWorktree, transcript: brief(`TENANCY: ${slashes(worktree)}`) }] });
  expect('deny', inTree(submodule, rmOld(submodule)), 'a submodule is never a tenancy worktree even when the record names it', { records: harness(submodule) });
  expect('deny', asAgent('Bash', { command: 'rm src/x.ts' }, { cwd: mainCheckout }), 'a file of the MAIN checkout (a .git directory is not a linked worktree)', { records: harness(mainCheckout) });
  expect('deny', asAgent('Bash', { command: `rm ${p('provision.mjs')}` }, { cwd: worktree }), 'a file outside the worktree even from a worktree', { records: harness(worktree) });
  expect('deny', asAgent('Bash', { command: 'rm "$X"' }, { cwd: worktree }), 'a variable even inside a worktree', { records: harness(worktree) });
  expect('deny', asAgent('Bash', { command: `rm ${slashes(path.join(worktree, 'src', 'old.ts'))}` }, { cwd: SCRATCH }), 'the same file when the agent does not stand in that worktree', { records: harness(worktree) });
  expect('deny', asAgent('Bash', { command: `rm ${p('provision.mjs')}` }), 'records are not even asked when the agent stands in no worktree', { records: () => { throw new Error('records were read'); } });

  const pointedElsewhere = path.join(ROOT, 'wt-elsewhere');

  put(path.join(pointedElsewhere, '.git'), 'gitdir: elsewhere');
  put(path.join(pointedElsewhere, 'src', 'old.ts'));

  expect('deny', inTree(pointedElsewhere, rmOld(pointedElsewhere)), 'a .git file that does not point into .git/worktrees', { records: harness(pointedElsewhere) });

  // --- links inside a folder the agent owns ------------------------------------------------------------
  expect('deny', bash(`rm -rf ${p('linkdir')}`), 'an owned folder holding a junction to a target the agent does not own');
  expect('allow', bash(`rm -rf ${p('linkdir2')}`), 'an owned folder holding a junction to a target the agent owns');
  expect('deny', pwsh(`Remove-Item -Recurse -Force '${at('linkdir')}'`), 'Remove-Item -Recurse of an owned folder with a foreign junction inside');
  check('the refusal names the junction and never the files behind it', reasonOf(bash(`rm -rf ${p('linkdir')}`)).includes('out') && !reasonOf(bash(`rm -rf ${p('linkdir')}`)).includes('outside-file.txt'));
  expect('deny', bash(`rm ${p('linkdir', 'out')}`), 'the foreign junction itself, named directly');
  expect('deny', bash(`rm ${p('holder', 'lnk-owned')}`), 'a link in a foreign folder is foreign even when its target is owned');
  expect('allow', bash(`rm -rf ${p('ownempty')}`), 'an empty folder the agent made');
  expect('deny', bash(`rmdir ${p('emptydir')}`), 'an empty folder the agent did not make');
  expect('allow', bash(`cmd /c del ${p('mine.mjs')}`), 'a nested cmd /c del with forward slashes is judged on its path');
  expect('deny', bash(`rm -rf ${p('holder')}`), 'a folder holding a foreign file and a junction');
  check('a junction is a leaf: the refusal names the link and never the target\'s files', reasonOf(bash(`rm -rf ${p('holder')}`)).includes('lnk') && !reasonOf(bash(`rm -rf ${p('holder')}`)).includes('outside-file.txt'));

  // --- names that look like syntax, folders that hold traps ------------------------------------------
  expect('deny', bash(`rm ${p('br[1].txt')}`), 'a foreign file whose name is also a glob (the literal name counts)');
  expect('deny', pwsh(`Remove-Item -LiteralPath '${at('fb{x,y}.txt')}'`), 'a foreign file whose name is also a brace list, in PowerShell where braces are not expanded');
  expect('allow', pwsh(`Remove-Item -LiteralPath '${at('tick`x.txt')}'`), 'an own file with a backtick in its name, in PowerShell where a backtick is not a substitution');
  expect('deny', bash('rm %TEMP%/x.txt'), 'a cmd-style variable');
  expect('deny', bash(`rmdir ${p('emptydir')}`), 'a foreign empty folder');
  expect('deny', bash(`rm -rf ${p('nested')}`), 'a foreign file three folders deep');
  check('the refusal names the file three folders deep', reasonOf(bash(`rm -rf ${p('nested')}`)).includes('f.txt'));
  expect('deny', bash(`rm ${p('provision.mjs')} && rmdir ${p('provision.mjs')}`), 'the same foreign file named twice');
  check('the refusal names the first command that reaches the file', reasonOf(bash(`rm ${p('provision.mjs')} && rmdir ${p('provision.mjs')}`)).includes('and rm would delete 1 file'));
  expect('allow', bash(`find -L ${p('mydir')} -delete`), 'find with a leading -L before its start path');
  expect('deny', bash('find -name \'*.mjs\' -delete'), 'find with no start path deletes under the working directory');
  expect('allow', bash(`rm -rf ${p('casedir')}`), 'an authored file under a name with capitals, found by its folded spelling');
  expect('deny', bash(`rm ${p('same-call.txt')}`), 'a foreign file written by nobody in this agent\'s journal');

  // --- the judge on its own, with injected edges -------------------------------------------------------
  /** The judge's verdict, or a marker when it throws, so a throw is a failed check and never a crash. @es El veredicto del juez, o una marca si lanza. */
  function judged(command, seams = {}, dialect = 'bash', payload = bash(command)) {
    try {
      return judgeDeletion(payload, dialect, command, seams);
    } catch (error) {
      return { threw: error.message };
    }
  }

  const neverRead = () => {
    throw new Error('the journal was read');
  };

  check('judge: a line that deletes nothing never reads the journal', judged('ls -la', { journalOf: neverRead }) === undefined);
  check('judge: an unresolvable target is refused without reading the journal', judged('rm "$X"', { journalOf: neverRead })?.code === 'variable');
  check('judge: an agent that cannot be told apart cannot be judged and allows', judged(`rm ${p('provision.mjs')}`, { journalOf: neverRead }, 'bash', { ...bash(''), agent_id: undefined, transcript_path: undefined }) === undefined);
  check('judge: a deletion over the walk limit is refused as unresolvable', judged(`rm -rf ${p('shared')}`, { limit: 1 })?.code === 'limit');
  check('judge: a walk exactly at the limit is judged, not refused', judged(`rm -rf ${p('shared')}`, { limit: 2 })?.kind === 'foreign');
  check('judge: the foreign verdict lists each foreign file once', judged(`rm ${p('provision.mjs')} ${p('provision.mjs')}`)?.files?.length === 1);
  check('judge: the journal it is given decides', judged(`rm ${p('provision.mjs')}`, { journalOf: () => new Map([[foreignCanonical, Date.now() - 3_600_000]]) }) === undefined);

  const mineOnly = ownershipOf(new Map([[canonical(at('shared', 'y.txt')), Date.now() - 3_600_000]]), undefined);
  const sharedFolder = foreignLeaves(at('shared'), mineOnly, 2);

  check('foreignLeaves: only the foreign file of a mixed folder', sharedFolder.foreign.length === 1 && sharedFolder.foreign[0].endsWith('x.txt') && !sharedFolder.exceeded);
  check('foreignLeaves: a walk past the limit is exceeded', foreignLeaves(at('shared'), ownershipOf(new Map(), undefined), 1).exceeded);
  check('foreignLeaves: a path that does not exist holds nothing', foreignLeaves(at('nothing'), ownershipOf(new Map(), undefined)).foreign.length === 0);

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
  check('wildcard: a star retries from the start of its run', wildcardMatch('*ab', 'aab') && wildcardMatch('a*b*c', 'aXbXbXc'));
  check('brace: more than a thousand words is unsupported, never truncated', braceExpansion('{a,b}'.repeat(11)).unsupported === true && braceExpansion('{a,b}'.repeat(9)).words.length === 512);
  check('brace: a list', braceExpansion('a.{x,y}').words.join() === 'a.x,a.y');
  check('brace: two lists multiply', braceExpansion('{a,b}{1,2}').words.join() === 'a1,a2,b1,b2');
  check('brace: a nested list', braceExpansion('{a,{b,c}}').words.join() === 'a,b,c');
  check('brace: no comma is literal', braceExpansion('a{b}c').words.join() === 'a{b}c' && braceExpansion('{}').words.join() === '{}');
  check('brace: a range is reported unsupported', braceExpansion('x{1..3}').unsupported === true && braceExpansion('x{a,b}').unsupported === false);
  check('brace: an unclosed brace is literal', braceExpansion('a{b,c').words.join() === 'a{b,c');
  check('brace: an empty alternative', braceExpansion('a{,b}').words.join() === 'a,ab');
  check('expandPath: case folds where the file system folds it', expandPath(at('MINE*.MJS')).length === (process.platform === 'win32' ? 2 : 0));

  const expanded = expandPath(at('mine*.mjs')).map((file) => path.basename(file)).sort().join();

  check('expandPath: reads the real folder', expanded === 'mine-too.mjs,mine.mjs', expanded);
  check('expandPath: a wildcard in a folder segment', expandPath(path.join(ROOT, '*', 'mine.mjs')).filter((file) => existsSync(file)).length === 1);
  check('expandPath: a literal path comes back whether or not it exists', expandPath(at('nope.txt')).length === 1);
  check('expandPath: a wildcard under a missing folder yields nothing', expandPath(path.join(ROOT, 'missing', '*')).length === 0);
  check('expandPath: a plain file where a folder is expected does not stop the others', expandPath(path.join(ROOT, '*', 'prov*.mjs')).some((file) => file.endsWith('provision.mjs')));
  check('refusal: a walk limit is worded in both languages', safely(() => refusalText({ kind: 'unresolved', code: 'limit', via: 'rm' })).includes('more entries') && safely(() => refusalText({ kind: 'unresolved', code: 'limit', via: 'rm' })).includes('más entradas'));

  const targetsOf = (command, dialect = 'bash') => deletionTargets(command, dialect, SCRATCH);
  const names = (entries) => entries.map((entry) => (entry.path === undefined ? '(unresolvable)' : path.basename(entry.path)));

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
  check('targets: a line of only an assignment deletes nothing and does not throw', safely(() => targetsOf('FOO=1').length) === 0);
  check('targets: cmd flags (/q /f /a:r) are not operands', targetsOf(`del /q /f /a:r ${p('mine.mjs')}`).length === 1);
  check('targets: a slash word that is not a one-letter flag is an operand', targetsOf('del /abc').length === 1 && targetsOf('del /1').length === 1);
  check('targets: a two-letter word that is not a slash flag is an operand', targetsOf('del ab').length === 1);
  check('targets: Remove-Item value parameters are not operands', ['-Include *.log', '-Exclude *.log', '-Filter *.log', '-ErrorAction Stop', '-ea Stop'].every((option) => targetsOf(`Remove-Item -Path ${p('mine.mjs')} ${option}`, 'powershell').length === 1));
  check('targets: -Path:value (colon form) is the operand', names(targetsOf(`Remove-Item -Path:${p('mine.mjs')}`, 'powershell')).join() === 'mine.mjs');

  const commaList = names(targetsOf(`Remove-Item ${p('mine.mjs')},${p('mine.txt')}`, 'powershell'));

  check('targets: a comma list is read both as several paths and as one path with commas', commaList.length === 3 && commaList.includes('mine.mjs') && commaList.includes('mine.txt'), commaList.join(' | '));
  check('targets: find -execdir, -ok and -okdir with a remover delete', ['-execdir', '-ok', '-okdir'].every((action) => targetsOf(`find ${p('mydir')} ${action} rm {} +`).length === 1));
  check('targets: find reports the action that deletes', targetsOf(`find ${p('mydir')} -exec rm {} +`)[0]?.via === 'find -exec rm');
  check('targets: find through a launcher reports the launcher', targetsOf(`find ${p('mydir')} -exec sudo rm {} +`)[0]?.via === 'find -exec sudo');
  check('targets: find with no deleting action has none', targetsOf(`find ${p('mydir')} -exec echo {} +`).length === 0);
  check('targets: find only reads the command up to its terminator', targetsOf(`find ${p('mydir')} -exec echo {} ; -name rm`).length === 0);
  check('targets: find with several start paths lists each', targetsOf(`find ${p('mydir')} ${p('work')} -delete`).length === 2);
  check('targets: find with no start path starts at the working directory', names(targetsOf('find -delete')).join() === path.basename(SCRATCH));
  check('targets: xargs options with a value are skipped', targetsOf('xargs -n 5 rm')[0]?.via === 'xargs rm' && targetsOf('xargs -P 4 -I {} rm')[0]?.via === 'xargs rm');
  check('targets: a nested cmd /c with a backslash is reported with its reason', targetsOf('cmd /c del C:\\a\\b.txt').some((target) => target.unresolvable === 'backslash') && targetsOf('cmd /k del C:\\a\\b.txt').some((target) => target.unresolvable === 'backslash') && targetsOf('CMD /C del C:\\a\\b.txt').some((target) => target.unresolvable === 'backslash'));
  check('targets: a nested cmd /c without a backslash is read normally', targetsOf(`cmd /c del ${p('mine.mjs')}`).every((target) => target.unresolvable === undefined));
  check('targets: a git clean with the directory unknowable is reported', safely(() => deletionTargets('cd "$X" && git clean -f', 'bash', SCRATCH).some((target) => target.unresolvable === 'directory')) === true);
  check('targets: a git clean the preview lists becomes its listed paths', names(deletionTargets('git clean -f', 'bash', SCRATCH, { cleanPreview: () => ({ ok: true, paths: ['a.tmp', 'b/'] }) })).join() === 'a.tmp,b');
  check('targets: git clean -i runs its preview without the interactive flag', (() => {
    const seen = [];
    const preview = (_directory, args) => {
      seen.push(args.join(' '));

      return { ok: true, paths: [] };
    };

    deletionTargets('git clean -fdi -e keep -x', 'bash', SCRATCH, { cleanPreview: preview });
    deletionTargets('git clean --interactive -f', 'bash', SCRATCH, { cleanPreview: preview });
    deletionTargets('git clean -f -enode_ignore -- -if.tmp', 'bash', SCRATCH, { cleanPreview: preview });

    return seen.join('|') === 'clean -n -fd -e keep -x|clean -n -f|clean -n -f -enode_ignore -- -if.tmp';
  })());
  check('preview: lists what git would remove, CRLF or LF', previewFrom('Would remove a.tmp\r\nWould skip repository r\nWould remove b/\n').paths.join() === 'a.tmp,b/');
  check('preview: a name git quoted cannot be trusted', previewFrom('Would remove "a\\"b.tmp"\n').ok === false && previewFrom('Would remove a.tmp\n').ok === true);

  // --- what a call creates, and how it is journaled ----------------------------------------------------
  check('creation: mkdir with a mode and touch with a date take their values', creationTargets('mkdir -m 755 -p d1 d2 && touch -d "2020-01-01" f1', 'bash', SCRATCH).map((entry) => path.basename(entry.path)).join() === 'd1,d2,f1');
  check('creation: mkdir brace lists are expanded', creationTargets('mkdir -p a/{b,c}', 'bash', SCRATCH).length === 2);
  check('creation: -- ends the options of mkdir', creationTargets('mkdir -- -odd', 'bash', SCRATCH).length === 1);
  check('creation: md creates like mkdir', creationTargets('md newdir', 'bash', SCRATCH).length === 1);
  check('creation: New-Item -Path with -Name joins them', names(creationTargets('New-Item -Path d -Name n -ItemType File', 'powershell', SCRATCH)).join() === 'n');
  check('creation: New-Item with only -Name creates under the working directory', creationTargets('New-Item -Name n', 'powershell', SCRATCH)[0]?.path === path.join(SCRATCH, 'n'));
  check('creation: New-Item with a positional path and -ItemType', names(creationTargets('New-Item -ItemType Directory dd', 'powershell', SCRATCH)).join() === 'dd');
  check('creation: ni is an alias of New-Item', creationTargets('ni -Path x', 'powershell', SCRATCH).length === 1);
  check('creation: a command that does not create creates nothing', creationTargets('ls -la', 'bash', SCRATCH).length === 0);
  check('creation: a variable target is not guessed', creationTargets('mkdir "$X"', 'bash', SCRATCH).length === 0);
  check('creation: cp into an existing folder creates folder/<source name>', names(creationTargets(`cp ${p('mine.mjs')} ${p('mine.txt')} ${p('shared')}`, 'bash', SCRATCH)).join() === 'mine.mjs,mine.txt');
  check('creation: cp -t DIR names the folder', names(creationTargets(`cp -t ${p('shared')} ${p('mine.mjs')}`, 'bash', SCRATCH)).join() === 'mine.mjs' && names(creationTargets(`cp --target-directory=${p('shared')} ${p('mine.mjs')}`, 'bash', SCRATCH)).join() === 'mine.mjs');
  check('creation: mv into an existing folder creates folder/<source name>', names(creationTargets(`mv ${p('mine.mjs')} ${p('shared')}`, 'bash', SCRATCH)).join() === 'mine.mjs');
  check('creation: cp globbed sources each land in the folder', names(creationTargets(`cp ${p('mine*.mjs')} ${p('shared')}`, 'bash', SCRATCH)).sort().join() === 'mine-too.mjs,mine.mjs');
  check('creation: cp to a name that is not a folder creates no dropped file', creationTargets(`cp ${p('mine.mjs')} ${p('not-a-folder')}`, 'bash', SCRATCH).length === 0);
  check('creation: cp -S takes its value', creationTargets(`cp -S .bak ${p('mine.mjs')} ${p('shared')}`, 'bash', SCRATCH).length === 1);
  check('creation: Copy-Item into an existing folder creates folder/<source name>', names(creationTargets(`Copy-Item ${p('mine.mjs')} ${p('shared')}`, 'powershell', SCRATCH)).join() === 'mine.mjs');
  check('creation: Copy-Item -Path -Destination', names(creationTargets(`Copy-Item -Path ${p('mine.mjs')} -Destination ${p('shared')}`, 'powershell', SCRATCH)).join() === 'mine.mjs');
  check('creation: Move-Item with -Destination first', names(creationTargets(`Move-Item -Destination ${p('shared')} ${p('mine.mjs')}`, 'powershell', SCRATCH)).join() === 'mine.mjs');
  check('creation: cp --target-directory DIR as a separate word', names(creationTargets(`cp --target-directory ${p('shared')} ${p('mine.mjs')}`, 'bash', SCRATCH)).join() === 'mine.mjs');
  check('creation: -S and --suffix take their value, which is not a source', names(creationTargets(`cp -S ${p('mine.txt')} ${p('mine.mjs')} ${p('shared')}`, 'bash', SCRATCH)).join() === 'mine.mjs' && names(creationTargets(`cp --suffix ${p('mine.txt')} ${p('mine.mjs')} ${p('shared')}`, 'bash', SCRATCH)).join() === 'mine.mjs');
  check('creation: the PowerShell aliases cp, mv, copy and move are read with PowerShell grammar under PowerShell', ['cp', 'mv', 'copy', 'move'].every((alias) => names(creationTargets(`${alias} -Destination ${p('shared')} ${p('mine.mjs')}`, 'powershell', SCRATCH)).join() === 'mine.mjs'));
  check('creation: Copy-Item -LiteralPath', names(creationTargets(`Copy-Item -LiteralPath ${p('mine.mjs')} -Destination ${p('shared')}`, 'powershell', SCRATCH)).join() === 'mine.mjs');
  check('creation: the PowerShell aliases cpi, mi, copy and move drop files into a folder', ['cpi', 'mi', 'copy', 'move', 'copy-item', 'move-item'].every((alias) => names(creationTargets(`${alias} ${p('mine.mjs')} ${p('shared')}`, 'powershell', SCRATCH)).join() === 'mine.mjs'));
  check('creation: copy and move under bash drop files into a folder', names(creationTargets(`copy ${p('mine.mjs')} ${p('shared')}`, 'bash', SCRATCH)).join() === 'mine.mjs' && names(creationTargets(`move ${p('mine.mjs')} ${p('shared')}`, 'bash', SCRATCH)).join() === 'mine.mjs');
  check('creation: a copy with no destination creates nothing', safely(() => creationTargets('cp', 'bash', SCRATCH).length) === 0 && safely(() => creationTargets('Copy-Item', 'powershell', SCRATCH).length) === 0);
  check('creation: a copy onto an existing FILE drops nothing into it', creationTargets(`cp ${p('mine.mjs')} ${p('mine.txt')}`, 'bash', SCRATCH).length === 0);
  check('creation: a PowerShell cmdlet or alias nested under Bash keeps PowerShell grammar', ['Copy-Item', 'Move-Item', 'cpi', 'mi'].every((alias) => names(creationTargets(`${alias} -Destination ${p('shared')} ${p('mine.mjs')}`, 'bash', SCRATCH)).join() === 'mine.mjs'));
  check('journal: a transcript name must be agent-<id>.jsonl', agentKeyOf({ transcript_path: '/x/session.jsonl' }) === undefined && agentKeyOf({ transcript_path: '/x/agent-77ff.json' }) === undefined && agentKeyOf({ transcript_path: '/x/xagent-77ff.jsonl' }) === undefined);

  mkdirSync(stateDir('foreign-delete-guard'), { recursive: true });
  writeFileSync(path.join(stateDir('foreign-delete-guard'), 'planted.jsonl'), '{"path":"p","at":1}\n');
  check('journal: an unsafe key reads nothing, not even a file it would reach by climbing', readCreations('../planted').size === 0);

  const writeCall = (file) => ({ tool_name: 'Write', tool_input: { file_path: file, content: 'x' }, cwd: SCRATCH });

  check('pending: a Write of an absent file is recorded, canonical', pendingCreations(writeCall(at('absent.txt'))).join() === canonical(at('absent.txt')));
  check('pending: a Write of an existing file is not', pendingCreations(writeCall(at('provision.mjs'))).length === 0);
  check('pending: MultiEdit creates, Edit and NotebookEdit do not', creationsOfCall({ tool_name: 'MultiEdit', tool_input: { file_path: at('x.txt') }, cwd: SCRATCH }).length === 1 && creationsOfCall({ tool_name: 'Edit', tool_input: { file_path: at('x.txt') }, cwd: SCRATCH }).length === 0 && creationsOfCall({ tool_name: 'NotebookEdit', tool_input: { notebook_path: at('x.ipynb') }, cwd: SCRATCH }).length === 0);
  check('pending: sed -i creates nothing, a redirect does', creationsOfCall({ tool_name: 'Bash', tool_input: { command: 'sed -i s/a/b/ f.txt' }, cwd: SCRATCH }).length === 0 && creationsOfCall({ tool_name: 'Bash', tool_input: { command: 'echo x > f.txt' }, cwd: SCRATCH }).length === 1);
  check('pending: a call that names an existing folder records nothing for it', pendingCreations({ tool_name: 'Bash', tool_input: { command: `mkdir -p ${p('')}` }, cwd: SCRATCH }).length === 0);
  check('pending: duplicates are recorded once', pendingCreations({ tool_name: 'Bash', tool_input: { command: 'touch f.txt f.txt' }, cwd: SCRATCH }).length === 1);

  check('journal: the agent key is the agent id', agentKeyOf({ agent_id: 'a1B-2_c' }) === 'a1B-2_c');
  check('journal: a key is letters, digits, dash and underscore only', agentKeyOf({ agent_id: 'a.b' }) === undefined && agentKeyOf({ agent_id: 'a b' }) === undefined && agentKeyOf({ agent_id: 'a:b' }) === undefined);
  check('journal: the agent key falls back to the transcript file name', agentKeyOf({ transcript_path: 'C:\\x\\subagents\\agent-77ff.jsonl' }) === '77ff' && agentKeyOf({ transcript_path: '/x/subagents/agent-77ff.jsonl' }) === '77ff');
  check('journal: an unsafe or missing key is undefined', agentKeyOf({ agent_id: '../x' }) === undefined && agentKeyOf({ agent_id: '' }) === undefined && agentKeyOf({}) === undefined && agentKeyOf({ transcript_path: '/x/main.jsonl' }) === undefined && agentKeyOf({ transcript_path: '/x/agent-..%2f.jsonl' }) === undefined && agentKeyOf(undefined) === undefined);
  check('journal: the agent id wins over the transcript name', agentKeyOf({ agent_id: 'first', transcript_path: '/x/agent-second.jsonl' }) === 'first');
  check('journal: the journal lives in the isolated state folder, one file per agent', existsSync(path.join(stateDir('foreign-delete-guard'), 'authored', 'abc.jsonl')));

  recordCreations('torn', [canonical(at('mine.mjs'))], 5);
  mkdirSync(path.join(stateDir('foreign-delete-guard'), 'authored'), { recursive: true });
  appendFileSync(path.join(stateDir('foreign-delete-guard'), 'authored', 'torn.jsonl'), '{torn\n{"path":1,"at":5}\n{"path":"p","at":"x"}\n');
  recordCreations('torn', [canonical(at('mine.mjs'))], 9);
  recordCreations('maxed', [canonical(at('mine.mjs'))], 9);
  recordCreations('maxed', [canonical(at('mine.mjs'))], 5);

  check('journal: a torn or malformed line hides nothing around it and adds nothing', readCreations('torn').get(canonical(at('mine.mjs'))) === 9 && readCreations('torn').size === 1);
  check('journal: the latest time wins, not the last line', readCreations('maxed').get(canonical(at('mine.mjs'))) === 9);

  const statOf = (birthtimeMs, ctimeMs) => () => ({ birthtimeMs, ctimeMs });
  const unrecorded = [];

  check('journal: a birth time of zero falls back to the change time', bornAt('x', statOf(0, 123)) === 123 && bornAt('x', statOf(50, 99)) === 50);
  check('journal: a path that cannot be statted has no birth time', bornAt('x', () => { throw new Error('ENOENT'); }) === undefined);
  check('journal: a path nobody recorded is answered without touching the file system', vouchedFor(new Map(), 'x', () => { unrecorded.push('statted'); return { birthtimeMs: 1, ctimeMs: 1 }; }) === false && unrecorded.length === 0);
  check('journal: a recorded path that no longer exists is not vouched for', vouchedFor(new Map([['x', 0]]), 'x', () => { throw new Error('ENOENT'); }) === false);
  check('journal: the birth time is compared with the record minus the tolerance', vouchedFor(new Map([['x', 10_000]]), 'x', statOf(10_000 - BIRTH_TOLERANCE_MS, 0)) === true && vouchedFor(new Map([['x', 10_000]]), 'x', statOf(10_000 - BIRTH_TOLERANCE_MS - 1, 0)) === false);
  check('journal: an agent with no journal has an empty map', readCreations('nobody-yet').size === 0 && readCreations('../x').size === 0);
  recordCreations('../escape', [canonical(at('mine.mjs'))], 1);
  recordCreations('empty-key-list', [], 1);
  check('journal: an unsafe key writes nothing and an empty list creates no file', !existsSync(path.join(stateDir('foreign-delete-guard'), 'escape.jsonl')) && !existsSync(path.join(stateDir('foreign-delete-guard'), 'authored', 'empty-key-list.jsonl')));

  const mine = readCreations('abc');

  check('ownership: a vouched file is owned', ownershipOf(mine, undefined).owns(at('mine.mjs')));
  check('ownership: something under a vouched folder is owned', ownershipOf(mine, undefined).owns(at('work', 'deep', 'built.bin')));
  check('ownership: a sibling that only shares a prefix is not owned', !ownershipOf(mine, undefined).owns(`${at('mine.mjs')}x`) && !ownershipOf(mine, undefined).owns(at('mine.mjs.bak')));
  check('ownership: a foreign file is not owned', !ownershipOf(mine, undefined).owns(at('provision.mjs')));
  check('ownership: the scratchpad root is not owned, a folder the agent made is', !ownershipOf(mine, undefined).owns(SCRATCH) && ownershipOf(mine, undefined).owns(at('mydir', 'anything.log')));
  check('ownership: writing a file INTO a folder does not make the folder the agent\'s', ownershipOf(mine, undefined).owns(at('shared', 'y.txt')) && !ownershipOf(mine, undefined).owns(at('shared', 'x.txt')) && !ownershipOf(mine, undefined).owns(at('shared')));
  check('ownership: the tenancy worktree is owned when given', ownershipOf(new Map(), worktree).owns(path.join(worktree, 'a', 'b.ts')) && !ownershipOf(new Map(), worktree).owns(path.join(otherWorktree, 'a')));
  check('ownership: a record whose path no longer exists vouches for nothing', !ownershipOf(new Map([[canonical(at('gone.txt')), 0]]), undefined).owns(at('gone.txt')));

  check('linkedWorktreeRoot: a linked worktree from a subfolder', linkedWorktreeRoot(path.join(worktree, 'src', 'sub')) === worktree);
  check('linkedWorktreeRoot: the main checkout, a submodule and a stray .git file have none', linkedWorktreeRoot(path.join(mainCheckout, 'src')) === undefined && linkedWorktreeRoot(path.join(submodule, 'src')) === undefined && linkedWorktreeRoot(pointedElsewhere) === undefined);
  check('linkedWorktreeRoot: outside every repository there is none', linkedWorktreeRoot(path.parse(ROOT).root) === undefined);
  check('tenancyWorktree: the harness record and the brief give it, nothing else does', safely(() => tenancyWorktree({ cwd: worktree, agentKey: 'abc', records: harness(worktree) })) === worktree && safely(() => tenancyWorktree({ cwd: worktree, agentKey: 'abc', records: byBrief(`TENANCY: ${slashes(worktree)}`) })) === worktree && safely(() => tenancyWorktree({ cwd: worktree, agentKey: 'abc', records: () => [] })) === undefined);
  check('linkedWorktreeRoot: a gitdir line needs its prefix, and a backslash spelling counts', linkedWorktreeRoot(noPrefix) === undefined && linkedWorktreeRoot(backslashed) === backslashed);

  const dangling = foreignLeaves(at('linkdir', 'out'), ownershipOf(mine, undefined), 100, readdirSync, () => { throw new Error('ENOENT'); });
  const calls = [];
  const counting = { ownsCanonical: (candidate) => { calls.push(candidate); return true; } };

  check('foreignLeaves: a link that cannot be resolved is foreign even inside an owned folder', foreignLeaves(at('linkdir'), ownershipOf(mine, undefined), 100, readdirSync, () => { throw new Error('ENOENT'); }).foreign.length === 1 && dangling.foreign.length === 1);
  check('foreignLeaves: inside an owned folder ownership is asked once, not for every entry', foreignLeaves(at('nested'), counting, 100).foreign.length === 0 && calls.length === 1, `${calls.length} questions`);

  const listed = [];
  const countingList = (directory, options) => {
    listed.push(directory);

    return readdirSync(directory, options);
  };

  foreignLeaves(at('nested'), ownershipOf(new Map(), undefined), 1, countingList);
  check('foreignLeaves: the walk stops as soon as the budget is spent', listed.length === 2, `${listed.length} folders read`);

  const unreadable = foreignLeaves(at('shared'), ownershipOf(new Map(), undefined), 100, () => {
    throw new Error('EACCES');
  });

  check('foreignLeaves: a folder that cannot be listed is foreign', unreadable.foreign.length === 1 && unreadable.foreign[0] === at('shared'));

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

  const manyForeignText = reasonOf(bash(`rm ${p('*.mjs')}`));

  check('refusal caps a long list and counts it', manyForeignText.includes('(showing 5)') && manyForeignText.includes('(se muestran 5)'), manyForeignText);
  check('refusal: the count is the files reached, not the files listed', manyForeignText.includes('7 file(s)') && manyForeignText.includes('7 fichero(s)'), manyForeignText);
  check('refusal: git quoted names are read as they are (quotePath off)', reasonOf(inRepo('git clean -f', repo)).includes('ñandú.tmp'));
  check('unresolvable refusal says why, in both languages', reasonOf(bash('rm "$X/a"')).includes('cannot tell') && reasonOf(bash('rm "$X/a"')).includes('no se puede saber') && reasonOf(bash('rm "$X/a"')).includes('depends on a variable') && reasonOf(bash('rm "$X/a"')).includes('depende de una variable'));
  check('unresolvable refusal for stdin says why', reasonOf(bash('ls | xargs rm')).includes('standard input') && reasonOf(bash('ls | xargs rm')).includes('entrada estándar'));
  check('unresolvable refusal for the pipeline says why', reasonOf(pwsh('Get-ChildItem | Remove-Item')).includes('pipeline') && reasonOf(pwsh('Get-ChildItem | Remove-Item')).includes('canalización'));
  check('unresolvable refusal for an unknowable folder says why', reasonOf(bash('cd "$X" && rm a')).includes('the folder it runs in') && reasonOf(bash('cd "$X" && rm a')).includes('la carpeta en la que corre'));
  check('unresolvable refusal for a git clean preview says why', reasonOf(inRepo('git clean -f', path.join(ROOT, 'not-a-repo'))).includes('git clean could not list') && reasonOf(inRepo('git clean -f', path.join(ROOT, 'not-a-repo'))).includes('git clean no pudo listar'));
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
  const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', windowsHide: true, env: process.env });
  const viaShim = run(JSON.stringify(bash(`rm ${p('provision.mjs')}`)));
  const viaShimMain = run(JSON.stringify(asMain('Bash', { command: `rm ${p('provision.mjs')}` })));
  const viaShimQuiet = run(JSON.stringify(bash(`rm ${p('mine.mjs')}`)));
  const viaShimWrite = run(JSON.stringify(asAgent('Write', { file_path: at('via-shim.txt'), content: 'x' })));

  check('shim: a delegated rm of a foreign file is denied on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"permissionDecision":"deny"'), viaShim.stderr);
  check('shim: the main session prints nothing, exit 0', viaShimMain.status === 0 && viaShimMain.stdout === '');
  check('shim: a delegated rm of an own file prints nothing, exit 0', viaShimQuiet.status === 0 && viaShimQuiet.stdout === '');
  check('shim: a delegated Write prints nothing and journals the file, exit 0', viaShimWrite.status === 0 && viaShimWrite.stdout === '' && readCreations('abc').has(canonical(at('via-shim.txt'))));
} finally {
  // Junctions go first and alone: removing a junction removes the link, never what it points at.
  for (const where of links) {
    try {
      rmdirSync(where);
    } catch {
      // already gone
    }
  }

  rmSync(TMP_FILE, { force: true });
  rmSync(ROOT, { recursive: true, force: true });
}

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
