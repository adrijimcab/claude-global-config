#!/usr/bin/env node
/**
 * Self-test for the shared contract-parity engine. It proves the DECISION over its state space on two
 * contracts built in a temporary project: the token-boundary near miss (`M1` against `M10`), an anchor
 * missing from one side, from the other and from both, the declaration states (no `anchors.json`, a
 * malformed one, a side with no contract file yet), and the hook itself, spawned with a payload recorded
 * from the harness. Every refusal is asserted on its TEXT as well, because a guard that denies for the wrong
 * stated reason gets routed around.
 *
 * @es Auto-test del motor compartido de paridad de contratos. Prueba la DECISIÓN sobre su espacio de estados
 * con dos contratos construidos en un proyecto temporal: el casi-acierto de frontera de token (`M1` contra
 * `M10`), un anchor que falta en un lado, en el otro y en ambos, los estados de la declaración (sin
 * `anchors.json`, uno malformado, un lado sin fichero de contrato) y el hook real, lanzado con un payload
 * registrado del harness. Cada rechazo se afirma también por su TEXTO.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { payloadFor } from '../hook-payloads/payloads.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { anchorPresence } from './anchor-match.mjs';
import { ANCHORS_FILE, readAnchors } from './anchors-file.mjs';
import { ownsContract } from './contract-presence.mjs';
import { realpathOf } from './real-path.mjs';
import { isUserHome } from './user-home.mjs';
import { contractParity } from './parity.mjs';

isolateState('agent-contract-parity');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');
const DECLARATION = path.join(HERE, 'guard.mjs.hook-registration.json');
const ROOT = mkdtempSync(path.join(tmpdir(), 'contract-parity-'));

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;

  if (condition) return;

  failures += 1;
  console.error(`FAIL: ${label}${detail === '' ? '' : ` -- ${detail}`}\n@es FALLO: ${label}`);
}

/** The outcome of `action`, or `threw` when it throws, so a broken reader fails a CHECK and does not crash the run. @es El resultado de `action`, o `threw` si lanza, para que un lector roto falle un CHECK y no tumbe la corrida. */
const outcome = (action) => {
  try {
    return action();
  } catch {
    return 'threw';
  }
};

let counter = 0;

/** A project with the given files (relative path -> text) and an optional anchors declaration. @es Un proyecto con ficheros y una declaración opcional. */
function project(files, declaration) {
  counter += 1;

  const dir = path.join(ROOT, `p${String(counter)}`);

  mkdirSync(dir, { recursive: true });

  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), text);
  }

  if (declaration !== undefined) {
    mkdirSync(path.join(dir, '.claude', 'agent-contract'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-contract', 'anchors.json'), typeof declaration === 'string' ? declaration : JSON.stringify(declaration));
  }

  return dir;
}

const DECLARED = { english: ['LEDGER.md', 'rules'], spanish: ['AGENTS.md'], anchors: ['M1', 'M10', 'ng lint', '@HostListener', '--no-verify'] };
const EN_FULL = 'M1 and M10 apply. Run ng lint. Avoid @HostListener. Never --no-verify.';
const ES_FULL = 'Aplican M1 y M10. Corre ng lint. Evitá @HostListener. Nunca --no-verify.';

// ---- the token boundary ------------------------------------------------------------------------------
check('M1 is carried by "M1-M8" (a hyphen ends the token)', anchorPresence('mandates M1-M8', 'M1') === 'token');
check('M1 is carried by "M1." at a sentence end', anchorPresence('see M1.', 'M1') === 'token');
check('M1 is carried by "(M1)"', anchorPresence('rule (M1) says', 'M1') === 'token');
check('M1 is only EMBEDDED in "M10"', anchorPresence('mandate M10 only', 'M1') === 'embedded');
check('M1 is only EMBEDDED in "XM1"', anchorPresence('mandate XM1 only', 'M1') === 'embedded');
check('M1 is only EMBEDDED in "M1_x"', anchorPresence('mandate M1_x only', 'M1') === 'embedded');
check('M1 is ABSENT from text without it', anchorPresence('nothing here', 'M1') === 'absent');
check('a later whole-token occurrence wins over an earlier embedded one', anchorPresence('M10 then M1 again', 'M1') === 'token');
check('an anchor opening with a symbol needs no left boundary', anchorPresence('the@HostListener decorator', '@HostListener') === 'token');
check('an anchor ending with a letter needs a right boundary', anchorPresence('flag --no-verifyx', '--no-verify') === 'embedded');
check('an anchor ending with a letter is carried before a space', anchorPresence('flag --no-verify now', '--no-verify') === 'token');
check('an anchor ending with a symbol needs no right boundary', anchorPresence('call foo()bar', 'foo()') === 'token');
check('a multi-word anchor matches whole', anchorPresence('run ng lint now', 'ng lint') === 'token');
check('a multi-word anchor does not match split', anchorPresence('run ng  lint now', 'ng lint') === 'absent');
check('an anchor at the very start and the very end of the text', anchorPresence('M1', 'M1') === 'token');
check('matching is case sensitive', anchorPresence('m1', 'M1') === 'absent');
check('a digit-led anchor is bounded on the left too', anchorPresence('x2fa', '2fa') === 'embedded');

// ---- the declaration ----------------------------------------------------------------------------------
check('no anchors.json: absent', readAnchors(project({})).status === 'absent');
check('malformed JSON: invalid', readAnchors(project({}, '{ not json')).status === 'invalid');
check('an anchors.json that is an array: invalid', readAnchors(project({}, '[]')).status === 'invalid');
check('empty anchors list: invalid', readAnchors(project({}, { ...DECLARED, anchors: [] })).status === 'invalid');
check('missing english list: invalid', readAnchors(project({}, { spanish: ['a'], anchors: ['M1'] })).status === 'invalid');
check('empty spanish list: invalid', readAnchors(project({}, { ...DECLARED, spanish: [] })).status === 'invalid');
check('a non-string anchor: invalid', readAnchors(project({}, { ...DECLARED, anchors: ['M1', 3] })).status === 'invalid');
check('an empty-string anchor: invalid', readAnchors(project({}, { ...DECLARED, anchors: ['M1', ''] })).status === 'invalid');
check('a duplicated anchor: invalid', readAnchors(project({}, { ...DECLARED, anchors: ['M1', 'M1'] })).status === 'invalid');
check('an absolute contract path: invalid', readAnchors(project({}, { ...DECLARED, english: [path.resolve('/etc/x.md')] })).status === 'invalid');
check('a contract path that climbs out of the project: invalid', readAnchors(project({}, { ...DECLARED, spanish: ['../x.md'] })).status === 'invalid');
check('an unknown key is invalid (a typo would silently check less)', readAnchors(project({}, { ...DECLARED, spnaish: ['x'] })).status === 'invalid');
check('an array declaration is named as not being an object', String(readAnchors(project({}, '[]')).problems).includes('JSON object'));
check('a declaration written with a byte-order mark reads', readAnchors(project({}, `﻿${JSON.stringify(DECLARED)}`)).status === 'ok');
check('a good declaration reads',readAnchors(project({}, DECLARED)).status === 'ok');
check('a good declaration keeps its anchors in order', readAnchors(project({}, DECLARED)).anchors.join() === DECLARED.anchors.join());
check('a windows-absolute contract path: invalid', readAnchors(project({}, { ...DECLARED, english: ['C:\\x.md'] })).status === 'invalid');
check('a posix-absolute contract path: invalid', readAnchors(project({}, { ...DECLARED, english: ['/x.md'] })).status === 'invalid');
check('a backslash climb out of the project: invalid', readAnchors(project({}, { ...DECLARED, spanish: ['..\\x.md'] })).status === 'invalid');
check('an invalid declaration names what is wrong', (readAnchors(project({}, { ...DECLARED, anchors: [] })).problems ?? []).length > 0);
check('an empty anchors list is named in the problems', String(readAnchors(project({}, { ...DECLARED, anchors: [] })).problems).includes('"anchors"'));
check('an unvalidated anchors list is still invalid when absent', readAnchors(project({}, { english: ['a'], spanish: ['b'] })).status === 'invalid');
check('an unknown key is named in the problems', String(readAnchors(project({}, { ...DECLARED, spnaish: ['x'] })).problems).includes('spnaish'));

// ---- the verdict ----------------------------------------------------------------------------------------
/** The verdict of a project; a throw is a verdict of its own, so a broken engine fails a CHECK instead of crashing the run. @es El veredicto de un proyecto; un lanzamiento es un veredicto propio, para que un motor roto falle un CHECK y no tumbe la corrida. */
function verdict(files, declaration = DECLARED) {
  try {
    return contractParity(project(files, declaration));
  } catch (error) {
    return { status: `threw: ${error instanceof Error ? error.message : String(error)}` };
  }
}

check('parity: every anchor on both sides', verdict({ 'LEDGER.md': EN_FULL, 'AGENTS.md': ES_FULL }).status === 'parity');
check('parity across a rules directory (recursive, .md only)', verdict({ 'LEDGER.md': 'M1 M10', 'rules/a/b.md': 'ng lint @HostListener --no-verify', 'rules/skip.txt': 'zzz', 'AGENTS.md': ES_FULL }).status === 'parity');
check('a rule file that is not .md does not carry an anchor', verdict({ 'LEDGER.md': 'M1 M10', 'rules/c.txt': 'ng lint @HostListener --no-verify', 'AGENTS.md': ES_FULL }).status === 'drift');

const nearMiss = verdict({ 'LEDGER.md': 'only M10 here. ng lint @HostListener --no-verify', 'AGENTS.md': ES_FULL });
check('M1 present only inside M10 is DRIFT', nearMiss.status === 'drift');
check('the near miss is missing from the English side', JSON.stringify(nearMiss.missingInEnglish) === JSON.stringify(['M1']));
check('the near miss is reported as embedded, not plainly absent', nearMiss.embeddedInEnglish.includes('M1'));
check('the Spanish side is untouched by an English near miss', nearMiss.missingInSpanish.length === 0 && nearMiss.embeddedInSpanish.length === 0);

const missingEs = verdict({ 'LEDGER.md': EN_FULL, 'AGENTS.md': 'Aplican M1 y M10. Corre ng lint. Evitá @HostListener.' });
check('an anchor missing from the Spanish side only', JSON.stringify(missingEs.missingInSpanish) === JSON.stringify(['--no-verify']) && missingEs.missingInEnglish.length === 0 && missingEs.status === 'drift');
check('a plainly absent anchor is not reported as embedded', missingEs.embeddedInSpanish.length === 0);

const missingBoth = verdict({ 'LEDGER.md': 'M1 M10 ng lint --no-verify', 'AGENTS.md': 'M1 M10 ng lint @HostListener' });
check('different anchors missing from each side are each attributed to their own side', JSON.stringify(missingBoth.missingInEnglish) === JSON.stringify(['@HostListener']) && JSON.stringify(missingBoth.missingInSpanish) === JSON.stringify(['--no-verify']));

check('an anchor missing from both is reported on both', JSON.stringify(verdict({ 'LEDGER.md': 'M1 M10 ng lint @HostListener', 'AGENTS.md': 'M1 M10 ng lint @HostListener' }).missingInEnglish) === JSON.stringify(['--no-verify']));
check('a side with no contract file yet is skipped, never green', verdict({ 'LEDGER.md': EN_FULL }).status === 'skipped');
check('both sides absent is skipped', verdict({}).status === 'skipped');
check('a skipped verdict names the side that is absent', String(verdict({ 'LEDGER.md': EN_FULL }).absentSides) === 'spanish');
check('the English side absent is named too', String(verdict({ 'AGENTS.md': ES_FULL }).absentSides) === 'english');
check('a declared path that does not exist beside one that does still reads the present one', verdict({ 'LEDGER.md': EN_FULL, 'AGENTS.md': ES_FULL }, { ...DECLARED, english: ['LEDGER.md', 'rules', 'NOPE.md'] }).status === 'parity');
check('a declared directory that does not exist is absent, not an error', String(verdict({ 'AGENTS.md': ES_FULL }, { ...DECLARED, english: ['rules'] }).absentSides) === 'english');
check('the English rules directory alone, without the ledger, is a present side', verdict({ 'rules/x.md': EN_FULL, 'AGENTS.md': ES_FULL }).status === 'parity');
check('a rules directory with no .md file is an absent side', String(verdict({ 'rules/x.txt': EN_FULL, 'AGENTS.md': ES_FULL }, { ...DECLARED, english: ['rules'] }).absentSides) === 'english');
check('no declaration: absent, not checked', outcome(() => contractParity(project({ 'LEDGER.md': EN_FULL, 'AGENTS.md': ES_FULL })).status) === 'absent');
check('an invalid declaration is invalid, never absent', verdict({ 'LEDGER.md': EN_FULL, 'AGENTS.md': ES_FULL }, { english: [] }).status === 'invalid');
check('anchors are kept in declared order in the report', JSON.stringify(verdict({ 'LEDGER.md': 'nothing', 'AGENTS.md': ES_FULL }).missingInEnglish) === JSON.stringify(DECLARED.anchors));
check('files of the English list are concatenated, not alternatives', verdict({ 'LEDGER.md': 'M1 M10 ng lint', 'rules/x.md': '@HostListener --no-verify', 'AGENTS.md': ES_FULL }).status === 'parity');

// ---- the hook, spawned with a recorded harness payload ---------------------------------------------------
function run(cwd, extraEnv = {}) {
  const payload = { ...payloadFor('Agent', 'MEASURED: none\nHYPOTHESIS: none', { sessionId: 'selftest' }), cwd };
  const result = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '', ...extraEnv } });

  return { status: result.status, out: result.stdout, decision: result.stdout === '' ? undefined : JSON.parse(result.stdout).hookSpecificOutput };
}

const drifted = project({ 'LEDGER.md': 'only M10 here. ng lint @HostListener --no-verify', 'AGENTS.md': ES_FULL }, DECLARED);
const drift = run(drifted);
const driftReason = String(drift.decision?.permissionDecisionReason);

check('the hook denies on drift', drift.decision?.permissionDecision === 'deny' && drift.status === 0);
check('the denial is for PreToolUse', drift.decision?.hookEventName === 'PreToolUse');
check('the denial names the anchor and the English side', driftReason.includes('M1') && driftReason.includes('English'));
check('the denial carries the Spanish half', driftReason.includes('@es'));
check('the denial explains the near miss', driftReason.includes('only inside a longer token'));
check('only the side that drifted is listed', !driftReason.includes('Missing from the Spanish contract') && driftReason.includes('Missing from the English contract: M1'));

const nothingEnglish = String(run(project({ 'LEDGER.md': 'nothing', 'AGENTS.md': ES_FULL }, DECLARED)).decision?.permissionDecisionReason);

check('every missing anchor of a side is listed', DECLARED.anchors.every((anchor) => nothingEnglish.includes(anchor)));

const withByteOrderMark = spawnSync(process.execPath, [GUARD], { input: `﻿${JSON.stringify({ ...payloadFor('Agent', 'x', { sessionId: 'selftest' }), cwd: drifted })}`, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });

check('the hook reads a payload that starts with a byte-order mark', withByteOrderMark.stdout.includes('"deny"'));
check('the hook finds the project from a subdirectory cwd', run(path.join(drifted, 'sub', 'deep')).decision?.permissionDecision === 'deny');
check('the hook honours CLAUDE_PROJECT_DIR over the cwd', run(path.join(ROOT, 'nowhere'), { CLAUDE_PROJECT_DIR: drifted }).decision?.permissionDecision === 'deny');
check('the hook allows on parity', run(project({ 'LEDGER.md': EN_FULL, 'AGENTS.md': ES_FULL }, DECLARED)).out === '');
check('the hook allows a project with no declaration', run(project({ 'LEDGER.md': 'x' })).out === '');
check('the hook allows a skipped verdict', run(project({ 'LEDGER.md': EN_FULL }, DECLARED)).out === '');

const invalid = run(project({ 'LEDGER.md': EN_FULL, 'AGENTS.md': ES_FULL }, '{ broken'));

check('the hook denies an invalid declaration, naming it', invalid.decision?.permissionDecision === 'deny' && String(invalid.decision?.permissionDecisionReason).includes('anchors.json'));
check('the hook allows when the payload is not JSON', spawnSync(process.execPath, [GUARD], { input: 'not json', encoding: 'utf8' }).stdout === '');
check('the hook allows when the payload names no directory', spawnSync(process.execPath, [GUARD], { input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } }).stdout === '');

// ---- a project that owns a contract must declare parity ----------------------------------------------------
const WITH_LEDGER = { '.claude/AGENT-LEDGER.md': '# Ledger\n' };
const WITH_IMPORT = { '.claude/CLAUDE.md': '# Project\n\n@AGENT-CONTRACT.md\n', '.claude/AGENT-CONTRACT.md': '# Contract\n' };
const CONTRACT_PAIR = { 'LEDGER.md': EN_FULL, 'AGENTS.md': ES_FULL };

check('a project with an AGENT-LEDGER owns a contract', ownsContract(project(WITH_LEDGER)));
check('a project whose CLAUDE.md imports an existing file owns a contract', ownsContract(project(WITH_IMPORT)));
check('a CLAUDE.md that imports a file that does not exist owns nothing', !ownsContract(project({ '.claude/CLAUDE.md': '@MISSING.md\n' })));
check('a CLAUDE.md whose only @ lines are the Spanish marker owns nothing', !ownsContract(project({ '.claude/CLAUDE.md': '@es Solo local.\n@es Otra linea.\n', '.claude/es': 'x' })));
check('an @ word without a slash or a dot is no import even when a file of that name exists', !ownsContract(project({ '.claude/CLAUDE.md': '@AGENTCONTRACT\n', '.claude/AGENTCONTRACT': 'x' })));
check('an import with a slash is an import', ownsContract(project({ '.claude/CLAUDE.md': '@sub/c\n', '.claude/sub/c': 'x' })));
check('an import on an indented line is an import', ownsContract(project({ '.claude/CLAUDE.md': '  @AGENT-CONTRACT.md\n', '.claude/AGENT-CONTRACT.md': 'x' })));
check('an import followed by prose on its line is an import', ownsContract(project({ '.claude/CLAUDE.md': '@AGENT-CONTRACT.md the contract\n', '.claude/AGENT-CONTRACT.md': 'x' })));
check('an import separated by a tab from its prose is an import', ownsContract(project({ '.claude/CLAUDE.md': '@AGENT-CONTRACT.md\tthe contract\n', '.claude/AGENT-CONTRACT.md': 'x' })));
check('an import whose target is a directory is no import', !ownsContract(project({ '.claude/CLAUDE.md': '@sub.d\n', '.claude/sub.d/x': 'y' })));
/** Runs `action` with the process home pointed at `home`, then restores it. @es Corre `action` con el home del proceso apuntando a `home` y lo restaura. */
function withHome(home, action) {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

  process.env.HOME = home;
  process.env.USERPROFILE = home;

  try {
    return action();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const homeWithContract = project({ 'shared.md': 'x' });

check('an import written as ~/ resolves against the home', withHome(homeWithContract, () => ownsContract(project({ '.claude/CLAUDE.md': '@~/shared.md\n' }))));
check('an import written as ~/ that is missing from the home owns nothing', !withHome(homeWithContract, () => ownsContract(project({ '.claude/CLAUDE.md': '@~/nope.md\n' }))));
check('a .claude directory with no CLAUDE.md and no ledger owns nothing', outcome(() => ownsContract(project({ '.claude/other.md': 'x' }))) === false);
check('a project with no .claude owns nothing', outcome(() => ownsContract(project({ 'LEDGER.md': 'x' }))) === false);
check('a contract and no declaration is undeclared', outcome(() => contractParity(project(WITH_LEDGER)).status) === 'undeclared');
check('an imported contract and no declaration is undeclared', outcome(() => contractParity(project(WITH_IMPORT)).status) === 'undeclared');
check('no contract and no declaration stays absent', outcome(() => contractParity(project({})).status) === 'absent');
check('a contract WITH a declaration is judged on parity, not undeclared', outcome(() => contractParity(project({ ...WITH_LEDGER, ...CONTRACT_PAIR }, DECLARED)).status) === 'parity');

const undeclaredRun = run(project(WITH_LEDGER));
const undeclaredReason = String(undeclaredRun.decision?.permissionDecisionReason);

check('the hook DENIES a project with a contract and no anchors.json', undeclaredRun.decision?.permissionDecision === 'deny' && undeclaredRun.status === 0);
check('the denial names the file to create', undeclaredReason.includes(ANCHORS_FILE));
check('the denial states the schema (the three keys)', ['"english"', '"spanish"', '"anchors"', '<contract file>', '<token>'].every((key) => undeclaredReason.includes(key)));
check('the denial carries the Spanish half', undeclaredReason.includes('@es'));
check('the denial says the project owns a contract', undeclaredReason.includes('its own'));
check('the hook DENIES a project whose CLAUDE.md imports a contract', run(project(WITH_IMPORT)).decision?.permissionDecision === 'deny');
check('the hook ALLOWS the same project once anchors.json is in parity', run(project({ ...WITH_LEDGER, ...CONTRACT_PAIR }, DECLARED)).out === '');
check('the hook ALLOWS a project with no .claude contract at all', run(project({ 'LEDGER.md': 'x' })).out === '');
check('the hook finds an undeclared project from a subdirectory', run(path.join(project(WITH_LEDGER), 'sub', 'deep')).decision?.permissionDecision === 'deny');
check('the hook finds an undeclared project through CLAUDE_PROJECT_DIR', run(path.join(ROOT, 'nowhere'), { CLAUDE_PROJECT_DIR: project(WITH_LEDGER) }).decision?.permissionDecision === 'deny');

const fakeHome = project(WITH_IMPORT);
const insideHome = path.join(fakeHome, 'work', 'plain');

mkdirSync(insideHome, { recursive: true });
// The ACCOUNT's own profile counts as a home even when the environment names another one (a sandbox or a
// fixture). @es El perfil real de la cuenta cuenta como home aunque el entorno nombre otro.
check('the account profile is a home even when HOME names a fixture', withHome(fakeHome, () => isUserHome(userInfo().homedir)));
check('a path that does not exist resolves to an absolute path', path.isAbsolute(realpathOf(path.join('no-such-folder', 'x'))));
check('a path that exists resolves to itself or its real form', realpathOf(ROOT).length > 0);
check('the process home is a home', withHome(fakeHome, () => isUserHome(fakeHome)));
check('a folder under a home is not a home', withHome(fakeHome, () => !isUserHome(insideHome)));
check('a folder under a user home that owns a contract is no project: allowed', run(insideHome, { HOME: fakeHome, USERPROFILE: fakeHome }).out === '');
check('the same folder is a project when that directory is NOT the home: denied', run(insideHome).decision?.permissionDecision === 'deny');

// ---- the wiring --------------------------------------------------------------------------------------------
const declared = JSON.parse(readFileSync(DECLARATION, 'utf8'));

check('the sidecar registers PreToolUse for Agent and Task, not SendMessage', declared.registrations?.[0]?.event === 'PreToolUse' && declared.registrations[0].matcher === 'Agent|Task');

rmSync(ROOT, { recursive: true, force: true });

console.log(`${String(checks - failures)}/${String(checks)} checks passed. @es ${String(checks - failures)}/${String(checks)} comprobaciones pasaron.`);
process.exit(failures === 0 ? 0 : 1);
