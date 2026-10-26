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
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { isolateState, stateDir } from '../hook-state/locations.mjs';
import { canonical } from '../shared-temp-guard/shared-temp-targets.mjs';
import { agentKeyOf, bornInside, confirmCall, identityOf, readJournal, recordCall, sameIdentity } from './authored-journal.mjs';
import { creationsOfCall, ownershipOf, pendingCreations } from './authorship.mjs';
import { creationTargets } from './creation-targets.mjs';
import { deletionTargets, previewFrom } from './deletion-targets.mjs';
import { foreignLeaves } from './foreign-paths.mjs';
import { evaluate } from './guard.mjs';
import { judgeDeletion } from './judge.mjs';
import { declaredPaths, linkedWorktreeRoot, tenancyWorktree } from './own-tree.mjs';
import { MESSAGES, refusalText } from './refusal.mjs';
import { braceExpansion, expandPath, wildcardMatch } from './wildcards.mjs';

isolateState('fdg');

const EMPTY = { confirmed: new Map(), intervals: [] };
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

/** `foreignLeaves` with a throw turned into a verdict that fails its check, never a crash. @es `foreignLeaves` con un lanzamiento convertido en un veredicto que falla su check, nunca un crash. */
function leavesOf(...args) {
  try {
    return foreignLeaves(...args);
  } catch (error) {
    return { foreign: [`threw: ${error.message}`], exceeded: false };
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
// The folder this run created, if any: the cleanup removes it only when it made it and it is empty again.
// @es La carpeta que creó esta corrida, si la hay: la limpieza la quita solo si la hizo ella y vuelve a estar vacía.
const CREATED_CLAUDE_TMP = mkdirSync(path.join(os.tmpdir(), 'claude'), { recursive: true });

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
  const id = `toolu_${(callCounter += 1)}`;

  tick();
  evaluate(JSON.stringify({ ...payload, hook_event_name: 'PreToolUse', tool_use_id: id }));
  tick();

  for (const effect of effects) {
    if (typeof effect === 'function') effect();
    else if (effect.endsWith('/')) mkdirSync(effect, { recursive: true });
    else put(effect);
  }

  tick();
  evaluate(JSON.stringify({ ...payload, hook_event_name: 'PostToolUse', tool_use_id: id }));
  tick();
}

/** The call reached the guard but never completed (another guard denied it, or it crashed): no PostToolUse. @es La llamada llegó al guard pero no se completó. */
function announceWithoutCompleting(payload, ...effects) {
  tick();
  evaluate(JSON.stringify({ ...payload, hook_event_name: 'PreToolUse', tool_use_id: `toolu_${(callCounter += 1)}` }));
  tick();

  for (const effect of effects) effect();
}

let callCounter = 0;

/** Waits a few milliseconds so that file births and call intervals never share a clock tick. @es Espera unos milisegundos para que nacimientos e intervalos no compartan un tic de reloj. */
function tick(milliseconds = 4) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

const agentWrites = (file) => announce(asAgent('Write', { file_path: file, content: 'x' }), file);

try {
  // THE ORCHESTRATOR'S AND OTHER ACTORS' FILES: they exist before the agent does anything. @es Los ficheros del orquestador y de otros actores: existen antes de que el agente haga nada.
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

  // WHAT THE AGENT MAKES, each announced while absent and then appearing. @es Lo que hace el agente: anunciado con el fichero ausente, aparece durante la llamada.
  agentWrites(at('mine.mjs'));
  agentWrites(at('mine-too.mjs'));
  announce(bash(`echo hi > ${p('mine.txt')}`), at('mine.txt'));
  announce(pwsh(`New-Item -ItemType Directory -Path '${at('mydir')}'`), `${at('mydir')}/`, at('mydir', 'out.log')); // out.log: dropped by a child process of the call @es out.log: lo dejó un proceso hijo de la llamada.
  agentWrites(at('mydir', 'a.txt'));
  announce(bash(`mkdir -p ${p('work')}`), `${at('work')}/`, at('work', 'built.bin'));
  agentWrites(at('shared', 'y.txt'));
  announce(bash(`cp -r src ${p('copied')}`), `${at('copied')}/`, at('copied', 'z.txt'));
  agentWrites(at('tick`x.txt'));
  agentWrites(at('casedir', 'Upper.TXT'));
  announce(bash(`cp ${p('mine.mjs')} ${p('dropdir')}/`), at('dropdir', 'mine.mjs'));
  announce(asAgent('Bash', { command: `cp ${p('mine.mjs')} .` }, { cwd: at('dropdir2') }), at('dropdir2', 'mine.mjs'));
  announce(bash(`mkdir ${p('linkdir')} ${p('linkdir2')}`), `${at('linkdir')}/`, `${at('linkdir2')}/`, () => link(path.join(ROOT, 'outside'), at('linkdir', 'out')), () => link(at('mydir'), at('linkdir2', 'in')));
  link(at('mydir'), at('holder', 'lnk-owned')); // a link in a foreign folder, to a target the agent owns @es un enlace en una carpeta ajena, a un destino que el agente posee.
  announce(bash(`mkdir ${p('ownempty')}`), `${at('ownempty')}/`);
  announce(bash(`mkdir ${p('nest2')} ${p('nest2', 'inner')}`), `${at('nest2')}/`, `${at('nest2', 'inner')}/`);

  // WHAT THE AGENT MERELY NAMES, all of it existing when the call is made: none of it may claim anything. @es Lo que el agente solo nombra, todo existente al llamar: nada de eso reclama nada.
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

  // --- the judges' scenarios: authorship is confirmed by the agent's own COMPLETED call -----------------
  const foreignCanonical = canonical(at('provision.mjs'));

  announceWithoutCompleting(asAgent('Write', { file_path: at('ghost.txt'), content: 'x' }), () => put(at('ghost.txt')));
  expect('deny', bash(`rm ${p('ghost.txt')}`), 'a call another guard denied never completes, so a file that appears at its target is foreign');

  announce(bash(`false && touch ${p('failed.txt')}`));
  put(at('failed.txt'));
  expect('deny', bash(`rm ${p('failed.txt')}`), 'a command whose creation never happened confirms nothing, so a file that appears there is foreign');

  agentWrites(at('recreate.txt'));
  expect('allow', bash(`rm ${p('recreate.txt')}`), 'a file the agent wrote is its own while it is the same file');
  rmSync(at('recreate.txt'));
  tick();
  put(at('recreate.txt'));
  expect('deny', bash(`rm ${p('recreate.txt')}`), 'a file deleted and recreated by someone else has a new identity and is foreign');

  announce(bash(`mkdir -p ${p('sharedroot')}`), `${at('sharedroot')}/`, at('sharedroot', 'child.txt'));
  put(at('sharedroot', 'foreign.txt'));
  tick();
  announce(bash('make build'), at('sharedroot', 'during.txt'));
  tick();
  put(at('sharedroot', 'after.txt'));
  expect('allow', bash(`rm ${p('sharedroot', 'child.txt')}`), 'a file a child process dropped during the call that made the folder is the agent\'s');
  expect('deny', bash(`rm ${p('sharedroot', 'foreign.txt')}`), 'a file another actor put in the agent\'s folder outside its calls is foreign');
  expect('deny', bash(`rm ${p('sharedroot', 'after.txt')}`), 'a file another actor put there after the agent\'s last call is foreign');
  expect('deny', bash(`rm -rf ${p('sharedroot')}`), 'a shared root the agent happened to make first does not capture what others put in it');
  expect('allow', bash(`rm ${p('sharedroot', 'during.txt')}`), 'KNOWN LIMIT: a file written during one of the agent\'s own calls is taken for its child process\'s');

  agentWrites(at('moveme.txt'));
  announce(bash(`mv ${p('moveme.txt')} ${p('moved.txt')}`), () => renameSync(at('moveme.txt'), at('moved.txt')));
  expect('allow', bash(`rm ${p('moved.txt')}`), 'the destination of the agent\'s own move is confirmed by the file identity, which a rename keeps');
  expect('deny', bash(`mv ${p('provision.mjs')} ${p('stolen.txt')}`), 'moving a foreign file removes it from where it is (and would launder it as the agent\'s)');
  expect('deny', pwsh(`Move-Item '${at('provision.mjs')}' '${at('stolen.txt')}'`), 'the same with Move-Item');
  expect('allow', bash(`mv ${p('mine.txt')} ${p('mine-renamed.txt')}`), 'moving the agent\'s own file');

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
  put(path.join(repo, 'ñandú.tmp')); // git quotes a name like this unless told not to @es git entrecomilla un nombre así salvo que se le diga lo contrario.
  mkdirSync(path.join(ROOT, 'not-a-repo'), { recursive: true });

  const inRepo = (command, cwd) => asAgent('Bash', { command }, { cwd });
  const inRepoWrite = (file, cwd) => announce(asAgent('Write', { file_path: file, content: 'x' }, { cwd }), file);

  inRepoWrite(path.join(repo, 'mine.tmp'), repo);
  inRepoWrite(path.join(repoMine, 'mine.tmp'), repoMine);
  inRepoWrite(path.join(repoMine, '-if.tmp'), repoMine); // a pathspec that looks like clean options @es una ruta que parece opciones de clean.

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
  expect('deny', inTree(worktree, rmOld(worktree)), 'a brief that names the worktree only by its folder name declares no path', { records: byBrief('TENANCY: wt-mine') });
  expect('deny', inTree(worktree, rmOld(worktree)), 'a brief that declares a same-named worktree elsewhere grants nothing', { records: byBrief(`TENANCY: ${slashes(path.join(ROOT, 'elsewhere', 'wt-mine'))}`) });
  expect('allow', inTree(worktree, rmOld(worktree)), 'a brief that declares the path in Git Bash spelling and quotes', { records: byBrief(`TENANCY: "${gitBash(worktree)}", checkout`) });
  expect('allow', inTree(worktree, rmOld(worktree)), 'a brief that declares two paths, one of them this worktree', { records: byBrief(`TENANCY: ${slashes(otherWorktree)} ${slashes(worktree)}`) });
  check('declaredPaths: only absolute paths of TENANCY lines count, canonical', declaredPaths(`Intro\nTENANCY: wt-mine, ${slashes(worktree)} (see)\nnot a TENANCY line ${slashes(otherWorktree)}`).join() === canonical(worktree));
  check('declaredPaths: a TENANCY line with no colon or no path declares nothing', declaredPaths('TENANCY\nTENANCY: none').length === 0);
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
  expect('allow', bash(`rm -rf ${p('nest2')}`), 'a folder the agent made holding an empty folder the agent also made');
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
  check('judge: the journal it is given decides', judged(`rm ${p('provision.mjs')}`, { journalOf: () => ({ confirmed: new Map([[foreignCanonical, identityOf(foreignCanonical)]]), intervals: [] }) }) === undefined);
  check('judge: the identity reader it is given decides', judged(`rm ${p('provision.mjs')}`, { journalOf: () => ({ confirmed: new Map([[foreignCanonical, { id: '1:1', born: 5 }]]), intervals: [] }), identify: () => ({ id: '1:1', born: 5 }) }) === undefined);

  const mineOnly = ownershipOf(readJournal('abc'), undefined);
  const sharedFolder = leavesOf(at('shared'), mineOnly, 2);

  check('foreignLeaves: only the foreign file of a mixed folder', sharedFolder.foreign.length === 1 && sharedFolder.foreign[0].endsWith('x.txt') && !sharedFolder.exceeded);
  check('foreignLeaves: a walk past the limit is exceeded', leavesOf(at('shared'), ownershipOf(EMPTY, undefined), 1).exceeded);
  check('foreignLeaves: a path that does not exist holds nothing', leavesOf(at('nothing'), ownershipOf(EMPTY, undefined)).foreign.length === 0);

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
  expect('deny', bash(`cmd //c del ${p('provision.mjs')}`), 'Git Bash spells cmd /c as //c: the script is read and the foreign file refused');
  expect('allow', bash(`cmd //c del ${p('mine.mjs')}`), 'cmd //c del of the agent\'s own file');
  expect('deny', bash(`cmd //c del ${SCRATCH}\\*.mjs`), 'cmd //c with a backslash path is refused as unresolvable');
  expect('deny', bash(`cmd //k del ${p('provision.mjs')}`), 'cmd //k');
  expect('deny', bash(`cd "$X" && cmd //c del ${p('provision.mjs')}`), 'cmd //c after a cd that cannot be followed');
  check('targets: cmd //c and //k scripts are read, in any case', ['cmd //c', 'cmd //k', 'CMD //C'].every((launcher) => targetsOf(`${launcher} del ${p('provision.mjs')}`).some((target) => target.path !== undefined && path.basename(target.path) === 'provision.mjs')));
  check('targets: cmd //c with a backslash reports the reason', targetsOf('cmd //c del C:\\a\\b.txt').some((target) => target.unresolvable === 'backslash'));
  check('targets: cmd //c that deletes nothing reports nothing', targetsOf('cmd //c echo hi').length === 0);
  check('targets: a move reports its sources, not its destination', safely(() => names(targetsOf(`mv ${p('mine.mjs')} ${p('mine.txt')} ${p('shared')}`)).join()) === 'mine.mjs,mine.txt' && safely(() => names(targetsOf(`Move-Item -Destination ${p('shared')} ${p('mine.mjs')}`, 'powershell')).join()) === 'mine.mjs');
  check('targets: a move with a target folder option', safely(() => names(targetsOf(`mv -t ${p('shared')} ${p('mine.mjs')}`)).join()) === 'mine.mjs');

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

  // --- the journal on its own, with injected identities ------------------------------------------------
  mkdirSync(stateDir('foreign-delete-guard'), { recursive: true });
  writeFileSync(path.join(stateDir('foreign-delete-guard'), 'planted.jsonl'), '{"k":"confirm","id":"c","path":"p","ino":"1:1","born":1}\n');
  check('journal: an unsafe key reads nothing, not even a file it would reach by climbing', readJournal('../planted').confirmed.size === 0);
  check('journal: an agent with no journal has an empty one', readJournal('nobody-yet').confirmed.size === 0 && readJournal('nobody-yet').intervals.length === 0);

  const fakeFiles = new Map([['/a', { id: '9:9', born: 100 }]]);
  const identify = (target) => fakeFiles.get(target);

  recordCall('unit', 'c1', 1000, ['/a', '/b']);
  safely(() => confirmCall('unit', 'c1', 2000, identify));
  recordCall('unit', 'c2', 3000, ['/a']); // never completes @es nunca se completa.

  const unit = readJournal('unit');

  check('journal: a completed call confirms the targets that exist, with identity and birth, and discards the rest', unit.confirmed.get('/a')?.id === '9:9' && unit.confirmed.get('/a')?.born === 100 && !unit.confirmed.has('/b'));
  check('journal: a completed call leaves its interval, an unfinished one does not', unit.intervals.length === 1 && unit.intervals[0].start === 1000 && unit.intervals[0].end === 2000);
  safely(() => confirmCall('unit', 'never-started', 4000, identify));
  check('journal: a call that never started confirms nothing and ends nothing', readJournal('unit').intervals.length === 1);
  safely(() => confirmCall('unit', undefined, 5000, identify));
  check('journal: without a call id the latest open call is the one', readJournal('unit').intervals.length === 2 && readJournal('unit').intervals[1].start === 3000 && readJournal('unit').intervals[1].end === 5000);
  safely(() => confirmCall('unit', undefined, 6000, identify));
  safely(() => confirmCall('unit', 'c1', 7000, identify));
  check('journal: a call that already ended is not ended again', readJournal('unit').intervals.length === 2);

  const both = (target) => ({ id: `7:${target}`, born: 1 });

  recordCall('unit2', 'a', 10, ['/p']);
  recordCall('unit2', 'b', 20, ['/q']);
  safely(() => confirmCall('unit2', undefined, 30, both));
  check('journal: with several calls open, the latest one is the one and only its targets are confirmed', readJournal('unit2').intervals.length === 1 && readJournal('unit2').intervals[0].start === 20 && readJournal('unit2').confirmed.has('/q') && !readJournal('unit2').confirmed.has('/p'));

  recordCall('unit3', 'x', 1, ['/a']);
  recordCall('unit3', 'y', 2, ['/b']);
  safely(() => confirmCall('unit3', 'y', 3, both));
  check('journal: a call confirms only its own targets', readJournal('unit3').confirmed.has('/b') && !readJournal('unit3').confirmed.has('/a'));

  mkdirSync(path.join(stateDir('foreign-delete-guard'), 'authored'), { recursive: true });
  appendFileSync(path.join(stateDir('foreign-delete-guard'), 'authored', 'torn.jsonl'), '{torn\n{"k":"confirm","id":"x","path":1,"ino":"1:1","born":1}\n{"k":"confirm","id":"x","path":"p","ino":"1:1","born":"x"}\n{"k":"start","id":"s","at":"x"}\n{"k":"end","id":"s","at":5}\n{"k":"mystery","id":"q"}\n{"k":"start","at":5}\n{"k":"end","at":9}\n{"k":"confirm","id":"x","path":"q","ino":5,"born":1}\n{"k":"start","id":"s2","at":1}\n{"k":"end","id":"s2","at":"x"}\n');
  recordCall('torn', 'c', 10, ['/t']);
  safely(() => confirmCall('torn', 'c', 20, (target) => (target === '/t' ? { id: '2:2', born: 15 } : undefined)));
  check('journal: a torn or malformed line hides nothing around it and adds nothing', readJournal('torn').confirmed.size === 1 && readJournal('torn').confirmed.get('/t').born === 15 && readJournal('torn').intervals.length === 1);

  recordCall('../escape', 'c', 1, ['/x']);
  recordCall('start-only', 'c', 1, []);
  check('journal: an unsafe key writes nothing', !existsSync(path.join(stateDir('foreign-delete-guard'), 'escape.jsonl')));
  check('journal: a call with no targets still leaves its start, whose interval matters', existsSync(path.join(stateDir('foreign-delete-guard'), 'authored', 'start-only.jsonl')));

  const same = { id: '9:9', born: 100 };

  check('identity: the same id and birth is the same file, nothing else is', sameIdentity('/a', same, identify) && !sameIdentity('/a', { id: '9:8', born: 100 }, identify) && !sameIdentity('/a', { id: '9:9', born: 101 }, identify) && !sameIdentity('/nothing', same, identify));
  check('identity: a birth inside an interval counts, at either end', bornInside('/a', [{ start: 100, end: 200 }], identify) && bornInside('/a', [{ start: 50, end: 100 }], identify) && !bornInside('/a', [{ start: 101, end: 200 }], identify) && !bornInside('/a', [{ start: 1, end: 99 }], identify) && !bornInside('/nothing', [{ start: 0, end: 1e9 }], identify));
  check('identity: any one of several intervals is enough', bornInside('/a', [{ start: 1, end: 5 }, { start: 90, end: 110 }], identify));
  check('identity: a link has its own identity, not its target\'s', identityOf(at('linkdir', 'out')).id !== identityOf(path.join(ROOT, 'outside')).id);
  check('identity: a path that does not exist has none', identityOf(at('nothing-here')) === undefined);
  check('identity: id is device:inode, and a birth of zero falls back to the change time', identityOf('x', () => ({ dev: 1n, ino: 2n, birthtimeMs: 0n, ctimeMs: 77n })).born === 77 && identityOf('x', () => ({ dev: 1n, ino: 2n, birthtimeMs: 50n, ctimeMs: 77n })).born === 50 && identityOf('x', () => ({ dev: 1n, ino: 2n, birthtimeMs: 50n, ctimeMs: 77n })).id === '1:2');

  const mine = readJournal('abc');
  const mineOwns = (candidate) => safely(() => ownershipOf(mine, undefined).owns(candidate)) === true;
  const fakeTree = new Map([['/d', { id: '1:1', born: 1 }], ['/d/f', { id: '2:2', born: 15 }], ['/d/late', { id: '3:3', born: 25 }], ['/d/e', { id: '4:4', born: 2 }], ['/d/e/g', { id: '5:5', born: 16 }]]);
  const journalOfTree = (folderIdentity) => ({ confirmed: new Map([['/d', folderIdentity]]), intervals: [{ start: 10, end: 20 }] });
  const ownsInTree = (folderIdentity, target) => safely(() => ownershipOf(journalOfTree(folderIdentity), undefined, (candidate) => fakeTree.get(candidate)).ownsCanonical(target)) === true;

  check('ownership: below a folder the agent made, what was born inside its call intervals is owned', ownsInTree({ id: '1:1', born: 1 }, '/d/f') && ownsInTree({ id: '1:1', born: 1 }, '/d/e/g'));
  check('ownership: below a folder the agent made, what was born outside its call intervals is foreign', !ownsInTree({ id: '1:1', born: 1 }, '/d/late') && !ownsInTree({ id: '1:1', born: 1 }, '/d/e'));
  check('ownership: a folder whose identity changed owns nothing below it', !ownsInTree({ id: '1:0', born: 1 }, '/d/f') && !ownsInTree({ id: '1:1', born: 2 }, '/d/f'));
  check('ownership: a confirmed path is owned whatever its birth, while its identity holds', ownsInTree({ id: '1:1', born: 1 }, '/d'));
  check('ownership: a higher confirmed folder still counts when a lower one changed identity', safely(() => ownershipOf({ confirmed: new Map([['/d', { id: '1:1', born: 1 }], ['/d/e', { id: '0:0', born: 0 }]]), intervals: [{ start: 10, end: 20 }] }, undefined, (candidate) => fakeTree.get(candidate)).ownsCanonical('/d/e/g')) === true);


  check('ownership: a vouched file is owned', mineOwns(at('mine.mjs')));
  check('ownership: something under a vouched folder is owned', mineOwns(at('work', 'built.bin')));
  check('ownership: a sibling that only shares a prefix is not owned', !mineOwns(`${at('mine.mjs')}x`) && !mineOwns(at('mine.mjs.bak')));
  check('ownership: a foreign file is not owned', !mineOwns(at('provision.mjs')));
  check('ownership: the scratchpad root is not owned, a folder the agent made is', !mineOwns(SCRATCH) && mineOwns(at('mydir', 'out.log')));
  check('ownership: writing a file INTO a folder does not make the folder the agent\'s', mineOwns(at('shared', 'y.txt')) && !mineOwns(at('shared', 'x.txt')) && !mineOwns(at('shared')));
  check('ownership: the tenancy worktree is owned when given', safely(() => ownershipOf(EMPTY, worktree).owns(path.join(worktree, 'a', 'b.ts'))) === true && safely(() => ownershipOf(EMPTY, worktree).owns(path.join(otherWorktree, 'a'))) === false);

  check('linkedWorktreeRoot: a linked worktree from a subfolder', linkedWorktreeRoot(path.join(worktree, 'src', 'sub')) === worktree);
  check('linkedWorktreeRoot: the main checkout, a submodule and a stray .git file have none', linkedWorktreeRoot(path.join(mainCheckout, 'src')) === undefined && linkedWorktreeRoot(path.join(submodule, 'src')) === undefined && linkedWorktreeRoot(pointedElsewhere) === undefined);
  check('linkedWorktreeRoot: outside every repository there is none', linkedWorktreeRoot(path.parse(ROOT).root) === undefined);
  check('tenancyWorktree: the harness record and the brief give it, nothing else does', safely(() => tenancyWorktree({ cwd: worktree, agentKey: 'abc', records: harness(worktree) })) === worktree && safely(() => tenancyWorktree({ cwd: worktree, agentKey: 'abc', records: byBrief(`TENANCY: ${slashes(worktree)}`) })) === worktree && safely(() => tenancyWorktree({ cwd: worktree, agentKey: 'abc', records: () => [] })) === undefined);
  check('linkedWorktreeRoot: a gitdir line needs its prefix, and a backslash spelling counts', linkedWorktreeRoot(noPrefix) === undefined && linkedWorktreeRoot(backslashed) === backslashed);

  const dangling = leavesOf(at('linkdir', 'out'), ownershipOf(mine, undefined), 100, readdirSync, () => { throw new Error('ENOENT'); });

  check('foreignLeaves: a link that cannot be resolved is foreign even inside an owned folder', leavesOf(at('linkdir'), ownershipOf(mine, undefined), 100, readdirSync, () => { throw new Error('ENOENT'); }).foreign.length === 1 && dangling.foreign.length === 1);

  const listed = [];
  const countingList = (directory, options) => {
    listed.push(directory);

    return readdirSync(directory, options);
  };

  leavesOf(at('nested'), ownershipOf(EMPTY, undefined), 1, countingList);
  check('foreignLeaves: the walk stops as soon as the budget is spent', listed.length === 2, `${listed.length} folders read`);

  const unreadable = leavesOf(at('shared'), ownershipOf(EMPTY, undefined), 100, () => {
    throw new Error('EACCES');
  });

  check('foreignLeaves: a folder that cannot be listed is foreign', unreadable.foreign.length === 1 && unreadable.foreign[0] === at('shared'));

  // --- more cases found by the mutation campaign --------------------------------------------------------
  check('identity: ids are read as BigInt, so a 64-bit file id loses nothing', identityOf('x', (_target, mode) => (mode?.bigint ? { dev: 1n, ino: 9007199254740993n, birthtimeMs: 5n, ctimeMs: 5n } : { dev: 1, ino: 9007199254740992, birthtimeMs: 5, ctimeMs: 5 })).id === '1:9007199254740993');

  tick();
  evaluate(JSON.stringify({ ...asAgent('Write', { file_path: at('conc-a.txt'), content: 'x' }), hook_event_name: 'PreToolUse', tool_use_id: 'conc-A' }));
  evaluate(JSON.stringify({ ...asAgent('Write', { file_path: at('conc-b.txt'), content: 'x' }), hook_event_name: 'PreToolUse', tool_use_id: 'conc-B' }));
  put(at('conc-a.txt'));
  tick();
  evaluate(JSON.stringify({ ...asAgent('Write', { file_path: at('conc-a.txt'), content: 'x' }), hook_event_name: 'PostToolUse', tool_use_id: 'conc-A' }));
  tick();
  put(at('conc-b.txt'));
  expect('allow', bash(`rm ${p('conc-a.txt')}`), 'two calls in flight: the completed one confirms ITS target by call id');
  expect('deny', bash(`rm ${p('conc-b.txt')}`), 'two calls in flight: the other, never completed, confirms nothing');

  check('declaredPaths: every separator of a declaration splits its words', [' ', '\t', ',', ';', '"', '\'', '`', '(', ')'].every((separator) => declaredPaths(`TENANCY:${separator}${slashes(worktree)}${separator}`).includes(canonical(worktree))));
  check('declaredPaths: a line with no colon declares nothing, even with a path in it', declaredPaths(`TENANCY ${slashes(worktree)}`).length === 0);
  check('declaredPaths: a bare folder name is not a path', declaredPaths('TENANCY: wt-mine').length === 0);
  check('declaredPaths: the colon of a drive letter does not close the marker, whichever slash follows', declaredPaths(`TENANCY ${worktree}`).length === 0 && declaredPaths(`TENANCY ${slashes(worktree)}`).length === 0);
  check('declaredPaths: a qualifier before the colon is allowed, and its colon closes the marker', declaredPaths(`TENANCY note: ${slashes(worktree)}`).includes(canonical(worktree)) && declaredPaths(`TENANCY (a): ${slashes(worktree)}`).includes(canonical(worktree)));
  check('declaredPaths: only a colon after TWO letters, or after a non-letter, closes the marker', declaredPaths(`TENANCY note:${gitBash(worktree)}`).includes(canonical(worktree)) && declaredPaths(`TENANCY 1:${gitBash(worktree)}`).includes(canonical(worktree)));
  check('declaredPaths: a letter and a colon that is not followed by a slash closes the marker', declaredPaths(`TENANCY C: ${slashes(worktree)}`).includes(canonical(worktree)));
  expect('deny', inTree(worktree, rmOld(worktree)), 'a TENANCY line with no colon grants nothing', { records: byBrief(`TENANCY ${slashes(worktree)}`) });
  expect('deny', inTree(worktree, rmOld(worktree)), 'a brief that declares another worktree grants nothing', { records: byBrief(`TENANCY: ${slashes(otherWorktree)}`) });

  check('targets: cmd /c is read once, not twice', targetsOf(`cmd /c del ${p('provision.mjs')}`).length === 1);
  check('targets: every mover reads its sources', ['mv', 'move', 'mi', 'move-item'].every((mover) => safely(() => names(targetsOf(`${mover} ${p('mine.mjs')} ${p('shared')}`, 'powershell')).join()) === 'mine.mjs'));
  check('targets: a cmd //c script is read with bash grammar, whatever the outer dialect', targetsOf(`cmd //c del -WhatIf ${p('provision.mjs')}`).some((target) => target.path !== undefined));

  const seenPreviews = [];

  deletionTargets(`cmd //c "del ${p('mine.mjs')}; git clean -f"`, 'bash', SCRATCH, { cleanPreview: (_directory, args) => { seenPreviews.push(args.join(' ')); return { ok: true, paths: [] }; } });
  check('targets: the options given to the scan reach a cmd //c script', seenPreviews.length === 1 && seenPreviews[0] === 'clean -n -f', seenPreviews.join(' | '));
  check('targets: cmd //c after a cd that cannot be followed reports the folder', safely(() => targetsOf(`cd "$X" && cmd //c del ${p('provision.mjs')}`).some((target) => target.unresolvable === 'directory')) === true);

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
  check('shim: a delegated Write prints nothing and journals the file, exit 0', viaShimWrite.status === 0 && viaShimWrite.stdout === '' && safely(() => readFileSync(path.join(stateDir('foreign-delete-guard'), 'authored', 'abc.jsonl'), 'utf8')).toLowerCase().includes('via-shim.txt'));
} finally {
  // Junctions go first and alone: removing a junction removes the link, never what it points at. @es Las junctions primero y solas: quitar una junction quita el enlace, nunca su destino.
  for (const where of links) {
    try {
      rmdirSync(where);
    } catch {
      // already gone @es ya no está.
    }
  }

  rmSync(TMP_FILE, { force: true });
  rmSync(ROOT, { recursive: true, force: true });

  // Never what another process put there: a folder that is not empty is left as it is. @es Nunca lo que puso otro proceso: una carpeta no vacía se deja como está.
  if (CREATED_CLAUDE_TMP !== undefined && readdirSync(CREATED_CLAUDE_TMP).length === 0) rmdirSync(CREATED_CLAUDE_TMP);
}

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
