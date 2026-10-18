#!/usr/bin/env node
/**
 * Self-test for shared-temp-guard (second occurrence 2026-10-18: a worker wrote a mutant-campaign output to the
 * shared TEMP root and a peer session overwrote it; first occurrence 2026-10-12: `edit6.mjs` read and an
 * `m1.txt` commit-message file overwritten across sessions).
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - WHO CALLS: a subagent by `agent_id`; a subagent by a transcript under `subagents`; the main session
 *     (allowed everything, its scratchpad is already under `<tmp>/claude/`).
 *   - WHICH CHANNEL WRITES: a redirect, `tee`, `cp`, an `-o`/`--output` option, `git commit -F`/`--file`, a PowerShell
 *     content cmdlet, the Write and Edit tools, and `cd /tmp` followed by a relative target.
 *   - WHICH SPELLING OF THE ROOT: `os.tmpdir()` as given (the 8.3 short form on this machine), its long form,
 *     backslashes, forward slashes, upper and lower case, the Git Bash drive form and Git Bash `/tmp`.
 *   - WHERE UNDER IT: directly in the root, in a subdirectory, in `<tmp>/claude/` (allowed, the session tree),
 *     the `claude` entry itself (refused), a sibling that merely shares the prefix (allowed, path boundary).
 *   - DATA, not writes: a mentioned path, a read, an unresolvable target, a relative target in the worktree.
 *   - THE SHAPE OF THE OUTPUT and its failure modes: bilingual, names the target and both incidents, names the
 *     remedy; malformed JSON, a non-writing tool, an internal failure.
 *
 * @es Auto-test del shared-temp-guard. Estados: quién llama (subagente por `agent_id` o por transcript; la sesión
 * principal pasa), qué canal escribe (redirección, tee, cp, `-o`, `git commit -F`, cmdlets, Write y Edit), qué grafía
 * de la raíz (corta 8.3, larga, barras, mayúsculas, Git Bash), dónde (raíz, subdirectorio, `<tmp>/claude/`, el
 * hermano que comparte prefijo), lo que es dato y la forma de la salida.
 */

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { evaluate } from './guard.mjs';
import { MESSAGES } from './refusal.mjs';
import { sharedTempOffenders } from './shared-temp-targets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');
const WORKTREE = path.resolve(HERE, '..');
const TMP = os.tmpdir();
const TMP_LONG = realpathSync.native(TMP);
const slashes = (value) => value.split('\\').join('/');
const backslashes = (value) => value.split('/').join('\\');

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

/** A delegated agent's call. @es Una llamada de un agente delegado. */
const asSubagent = (tool, input) => ({ tool_name: tool, tool_input: input, cwd: WORKTREE, session_id: 'selftest', agent_id: 'a1b2c3' });

/** The main session's call: no agent id, a main transcript. @es Una llamada de la sesión principal. */
const asMain = (tool, input) => ({ tool_name: tool, tool_input: input, cwd: WORKTREE, session_id: 'selftest', transcript_path: 'C:/Users/x/.claude/projects/p/s1.jsonl' });

const asTranscriptSubagent = (tool, input) => ({ ...asMain(tool, input), transcript_path: 'C:/Users/x/.claude/projects/p/s1/subagents/agent-abc.jsonl' });

const verdictOf = (payload) => evaluate(JSON.stringify(payload))?.hookSpecificOutput?.permissionDecision;

function expect(verdict, payload, label) {
  const actual = verdictOf(payload);

  check(`${verdict}: ${label}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

const bash = (command) => ({ command });
const write = (file) => ({ file_path: file, content: 'x' });

// --- the premise of the 8.3 cases: this machine spells the TEMP root two ways ------------------------
process.stdout.write(`  info os.tmpdir()=${TMP} long=${TMP_LONG}\n`);

// --- the two named incidents and the plain cases ------------------------------------------------
expect('deny', asSubagent('Bash', bash('echo x > /tmp/out.txt')), 'redirect to Git Bash /tmp');
expect('deny', asSubagent('Write', write(path.join(TMP, 'm1.txt'))), 'Write to <os.tmpdir()>/m1.txt');
expect('deny', asSubagent('Bash', bash('git commit -F /tmp/m1.txt')), 'git commit -F /tmp/m1.txt');
expect('allow', asSubagent('Write', write(path.join(TMP, 'claude', 'proj', 'sess', 'scratchpad', 'x.mjs'))), 'Write to the session scratchpad under <tmp>/claude/');
expect('allow', asSubagent('Write', write(path.join(WORKTREE, 'scratch', 'x.mjs'))), 'Write inside the worktree');
expect('allow', asMain('Bash', bash('echo x > /tmp/out.txt')), 'the main session writing to /tmp');
expect('allow', asMain('Write', write(path.join(TMP, 'm1.txt'))), 'the main session using Write in the root');
expect('allow', asSubagent('Write', write(`${TMP}-other/x.txt`)), 'a sibling that shares the prefix (path boundary)');
expect('allow', asSubagent('Write', write(`${TMP_LONG}-other/x.txt`)), 'a sibling sharing the long-form prefix');
expect('deny', asSubagent('Write', write(path.join(TMP, 'm1.txt'))), 'the 8.3 spelling as os.tmpdir() gives it');
expect('deny', asSubagent('Write', write(path.join(TMP_LONG, 'm1.txt'))), 'the long spelling');
expect('allow', asSubagent('Bash', bash('echo x')), 'a command with no write');
check('malformed JSON passes (fails open)', evaluate('{not json') === undefined);
check('a payload with no tool_input passes', evaluate(JSON.stringify({ tool_name: 'Write', agent_id: 'a1' })) === undefined);

// --- who calls ----------------------------------------------------------------------------------
expect('deny', asTranscriptSubagent('Write', write(path.join(TMP, 'm1.txt'))), 'a subagent known only by its transcript directory');
expect('deny', asTranscriptSubagent('Bash', bash('echo x > /tmp/o')), 'the same, through Bash');

// --- spellings of the root ----------------------------------------------------------------------
for (const [label, root] of [
  ['long, forward slashes', slashes(TMP_LONG)],
  ['long, backslashes', backslashes(TMP_LONG)],
  ['long, upper case', TMP_LONG.toUpperCase()],
  ['long, lower case', TMP_LONG.toLowerCase()],
  ['short, forward slashes', slashes(TMP)],
  ['short, backslashes', backslashes(TMP)],
  ['short, lower case', TMP.toLowerCase()],
  ['short, upper case', TMP.toUpperCase()]
]) {
  expect('deny', asSubagent('Write', write(`${root}/spelled.txt`)), `Write, ${label}`);
}

const gitBashDrive = (value) => `/${value.charAt(0).toLowerCase()}${slashes(value).slice(2)}`;

expect('deny', asSubagent('Bash', bash(`echo x > ${gitBashDrive(TMP_LONG)}/o.txt`)), 'Git Bash drive spelling of the long root');
expect('deny', asSubagent('Bash', bash(`echo x > ${gitBashDrive(TMP)}/o.txt`)), 'Git Bash drive spelling of the short root');
expect('deny', asSubagent('Bash', bash('echo x > /tmp/sub/dir/o.txt')), 'Git Bash /tmp, deep subdirectory');
expect('deny', asSubagent('Bash', bash('echo x > "/tmp/with space.txt"')), 'Git Bash /tmp, quoted name');
expect('allow', asSubagent('Bash', bash('echo x > /tmpother/o.txt')), '/tmpother is not /tmp (boundary)');
expect('allow', asSubagent('Bash', bash('echo x > /tmp-other/o.txt')), '/tmp-other is not /tmp (boundary)');

// --- where under the root -----------------------------------------------------------------------
expect('deny', asSubagent('Write', write(path.join(TMP, 'other-session', 'deep', 'x.txt'))), 'a subdirectory of the root');
expect('deny', asSubagent('Write', write(path.join(TMP, 'claudette', 'x.txt'))), 'a directory whose name merely starts with claude');
expect('deny', asSubagent('Write', write(path.join(TMP, 'claude'))), 'the claude entry itself is not a session tree');
expect('allow', asSubagent('Write', write(path.join(TMP_LONG, 'claude', 'p', 's', 'scratchpad', 'x.mjs'))), 'the scratchpad, long spelling');
expect('allow', asSubagent('Write', write(path.join(TMP, 'CLAUDE', 'p', 'x.mjs'))), 'the session tree, other case');
expect('allow', asSubagent('Bash', bash('echo x > /tmp/claude/p/s/scratchpad/o.txt')), 'redirect into the session tree through Git Bash /tmp');
expect('deny', asSubagent('Write', write(TMP)), 'the root itself');

// --- which channel writes -----------------------------------------------------------------------
expect('deny', asSubagent('Edit', { file_path: path.join(TMP, 'edit6.mjs'), old_string: 'a', new_string: 'b' }), 'Edit tool');
expect('deny', asSubagent('Bash', bash('echo x >> /tmp/log.txt')), 'append redirect');
expect('deny', asSubagent('Bash', bash('node run.mjs > /tmp/campaign.txt 2>&1')), 'campaign output redirected');
expect('deny', asSubagent('Bash', bash('echo x | tee /tmp/t.txt')), 'tee');
expect('deny', asSubagent('Bash', bash('cp a.txt /tmp/b.txt')), 'cp destination');
expect('deny', asSubagent('Bash', bash('sed -i s/a/b/ /tmp/f.txt')), 'sed -i');
expect('deny', asSubagent('Bash', bash('curl -o /tmp/x.json https://example.invalid')), 'curl -o');
expect('deny', asSubagent('Bash', bash('curl -o/tmp/x.json https://example.invalid')), 'curl -o fused');
expect('deny', asSubagent('Bash', bash('tool --output /tmp/out.txt')), '--output');
expect('deny', asSubagent('Bash', bash('tool --output=/tmp/out.txt')), '--output=');
expect('deny', asSubagent('Bash', bash('git commit --file=/tmp/m1.txt')), 'git commit --file=');
expect('deny', asSubagent('Bash', bash('git commit --file /tmp/m1.txt')), 'git commit --file');
expect('deny', asSubagent('Bash', bash('git commit -F/tmp/m1.txt')), 'git commit -F fused');
expect('deny', asSubagent('Bash', bash('git -C . commit -a -F /tmp/m1.txt -- a.txt')), 'git commit -F after global options');
expect('deny', asSubagent('Bash', bash('git add a && git commit -F /tmp/m1.txt')), 'git commit -F after &&');
expect('deny', asSubagent('Bash', bash('cd /tmp && echo x > y.txt')), 'cd /tmp then a relative target');
expect('deny', asSubagent('Bash', bash('cd /tmp && tool -o y.txt')), 'cd /tmp then a relative -o target');
expect('deny', asSubagent('Bash', bash('cd /tmp && git commit -F m1.txt')), 'cd /tmp then a relative message file');
expect('deny', asSubagent('PowerShell', { command: `Set-Content -Path '${TMP_LONG}\\p.txt' -Value x` }), 'PowerShell Set-Content');
expect('deny', asSubagent('PowerShell', { command: `'x' | Out-File ${TMP}\\p.txt` }), 'PowerShell Out-File');
expect('deny', asSubagent('PowerShell', { command: `git commit -F ${TMP}\\m1.txt` }), 'PowerShell git commit -F');

// --- data, reads and unknowns -------------------------------------------------------------------
expect('allow', asSubagent('Bash', bash('echo /tmp/out.txt')), 'a mentioned path');
expect('allow', asSubagent('Bash', bash('git commit -m "see /tmp/m1.txt"')), 'a path in a commit message');
expect('allow', asSubagent('Bash', bash('cat /tmp/out.txt')), 'a read');
expect('allow', asSubagent('Bash', bash('cat <<EOF\nx > /tmp/o\nEOF')), 'a heredoc body');
expect('allow', asSubagent('Bash', bash('echo x > "$LOG_FILE"')), 'an unresolvable target (stated tradeoff)');
expect('allow', asSubagent('Bash', bash('git commit -F msg.txt')), 'git commit -F of a file in the worktree');
expect('allow', asSubagent('Bash', bash('git commit -F -')), 'git commit -F - reads stdin');
expect('allow', asSubagent('Bash', bash('echo x > scratch/out.txt')), 'a relative redirect inside the worktree');
expect('allow', asSubagent('Bash', bash('tool -o scratch/out.txt')), '-o into the worktree');
expect('allow', asSubagent('Read', { file_path: path.join(TMP, 'm1.txt') }), 'a Read tool is not a write');
expect('deny', asSubagent('Bash', bash('tool --output-file /tmp/o.txt')), '--output-file');
expect('deny', asSubagent('Bash', bash('tool --outfile=/tmp/o.txt')), '--outfile=');
expect('deny', asSubagent('Bash', bash('tool --out-file /tmp/o.txt')), '--out-file');
expect('deny', asSubagent('Bash', bash('echo x > "$F" && echo y > /tmp/o.txt')), 'an unresolvable target does not hide a literal one on the same line');
expect('deny', asSubagent('Bash', bash('(cd "$X" && tool -o a.txt); tool -o /tmp/z.txt')), 'an option target after a line whose directory is unknowable');
expect('allow', asSubagent('Bash', bash('git grep -F /tmp/pattern')), 'git grep -F is not the commit message file');
expect('allow', { ...asSubagent('Bash', bash('git commit -F -')), cwd: TMP }, 'git commit -F - reads stdin even when the worker stands in the root');
expect('allow', { ...asSubagent('Bash', bash('tool -o "$OUT"')), cwd: TMP }, 'a variable output target is unresolvable even when the worker stands in the root');
expect('allow', { ...asSubagent('Bash', bash('git commit -F "$MSG"')), cwd: TMP }, 'a variable message file is unresolvable even when the worker stands in the root');
expect('allow', asSubagent('Write', {}), 'a Write with no file_path');

// --- the decision on its own, with injected roots (boundary and canonical form) -----------------
const fake = '/shared-temp-selftest/tmp';
const offending = (target) => sharedTempOffenders([{ path: path.resolve(target), via: 'x' }], [path.resolve(fake)]).length;

check('decision: a file directly in the root is an offender', offending(`${fake}/a.txt`) === 1);
check('decision: a sibling sharing the prefix is not', offending(`${fake}-other/a.txt`) === 0);
check('decision: the session tree is not', offending(`${fake}/claude/a.txt`) === 0);

/** The decision's verdict as a string, so a throw is a failed check and never a crash. @es El veredicto de la decisión como texto: un lanzamiento es un check fallido, no un crash. */
function offenderVias(targets) {
  try {
    return sharedTempOffenders(targets, [path.resolve(fake)]).map((target) => target.via).join();
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

const foldsCase = process.platform === 'win32';

check('decision: an unresolvable target is skipped', offenderVias([{ path: undefined, unresolvable: 'x', via: 'x' }]) === '');
check('decision: only the offending targets are returned', offenderVias([{ path: path.resolve(`${fake}/a`), via: 'a' }, { path: path.resolve('/elsewhere/b'), via: 'b' }]) === 'a');
check('decision: an unresolvable target does not hide an offender after it', offenderVias([{ path: undefined, unresolvable: 'x', via: 'x' }, { path: path.resolve(`${fake}/a`), via: 'a' }]) === 'a');
check('decision: case is folded exactly where the file system folds it', offending(`${fake.toUpperCase()}/a.txt`) === (foldsCase ? 1 : 0));
check('decision: the session tree is matched in the same case rule', offending(`${fake}/CLAUDE/a.txt`) === (foldsCase ? 0 : 1));

// --- the shape of the output --------------------------------------------------------------------
const refusal = evaluate(JSON.stringify(asSubagent('Write', write(path.join(TMP, 'zz-unique-marker.txt')))));
const text = refusal?.hookSpecificOutput?.permissionDecisionReason ?? '';
const spanishAt = text.indexOf('  @es ');
const [english, spanish] = [text.slice(0, spanishAt), text.slice(spanishAt)];

check('refusal event is PreToolUse, decision deny', refusal?.hookSpecificOutput?.hookEventName === 'PreToolUse' && refusal?.hookSpecificOutput?.permissionDecision === 'deny');
check('refusal is bilingual: English then " @es " Spanish', text.includes('REFUSED') && spanishAt > text.indexOf('REFUSED'));
check('refusal keeps the Spanish accents', spanish.includes('RECHAZÓ') && spanish.includes('POR QUÉ') && spanish.includes('sesión'));

for (const [name, half] of [['English', english], ['Spanish', spanish]]) {
  check(`refusal names the target in the ${name} half`, half.includes('zz-unique-marker.txt'));
  check(`refusal names both incidents in the ${name} half`, half.includes('edit6.mjs') && half.includes('m1.txt') && half.includes('2026-10-12') && half.includes('2026-10-18'));
  check(`refusal names the remedy in the ${name} half`, half.includes('<tmp>/claude/<') && half.includes('scratchpad/') && half.includes('worktree'));
}

check('the message table has no bilingual problems', messageProblems(MESSAGES).length === 0, messageProblems(MESSAGES).join('; '));

/** The verdict when the decision throws; a throw that escapes is a failed check. @es El veredicto cuando la decisión lanza. */
function verdictWhenDecisionThrows() {
  try {
    return evaluate(JSON.stringify(asSubagent('Write', write(path.join(TMP, 'm1.txt')))), () => { throw new Error('boom'); });
  } catch (error) {
    return { escaped: error.message };
  }
}

check('an internal failure of the decision fails open', verdictWhenDecisionThrows() === undefined);

// --- the shim: the real process, stdin in, stdout out, with and without a BOM --------------------
const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', windowsHide: true });
const viaShim = run(JSON.stringify(asSubagent('Bash', bash('echo x > /tmp/o.txt'))));
const viaShimBom = run(`\uFEFF${JSON.stringify(asSubagent('Bash', bash('echo x > /tmp/o.txt')))}`);
const viaShimMain = run(JSON.stringify(asMain('Bash', bash('echo x > /tmp/o.txt'))));

check('shim: a subagent write to /tmp is denied on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"permissionDecision":"deny"'));
check('shim: a BOM-prefixed payload is denied too', viaShimBom.status === 0 && viaShimBom.stdout.includes('"deny"'));
check('shim: the main session prints nothing, exit 0', viaShimMain.status === 0 && viaShimMain.stdout === '');

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
