#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `vendored-edit-guard` — `vendored-copy-edited-in-place`.
 *
 * THE INCIDENT. A vendored module (`shell-command/shell-command.mjs`, owned by b100-am-ui and copied here
 * by `vendored/vendored.mjs sync`) was edited IN PLACE in `~/.claude/`. The provenance check went red
 * (EDITED IN THE KIT) and stayed red for a day and a half, because nothing stopped the edit and nothing
 * pointed at the owner copy. The guard is the mechanism: a write to any module `VENDORED` lists is denied
 * and the refusal names the owner path and the re-sync command.
 *
 * THE STATE SPACE THE DECISION RANGES OVER, each state exercised (`guard-that-cannot-go-red`):
 *   channel   Edit / Write / MultiEdit / NotebookEdit  |  Bash / PowerShell: redirection, `tee`, `sed -i`,
 *             `cp`, `mv`, `Copy-Item`, `Set-Content`, `Out-File`
 *   target    every module of `VENDORED` / a module of the install that is NOT vendored / the same relative
 *             path in the OWNER (the remedy, never refused) / a sibling folder sharing the root's prefix /
 *             `..` segments / a relative path against the payload's cwd / `~` / another letter case
 *   role      the target is the destination (refused) / the source or a read (allowed)
 *   the sync  `node ~/.claude/vendored/vendored.mjs sync` writes the copies as a CHILD process, which a
 *             `PreToolUse` guard never sees: it stays allowed
 *   caller    main session and subagent alike are refused (the incident is not about who edits)
 *   own failures  not JSON, empty, BOM, null / non-string fields, a target nobody can resolve (allowed)
 * plus the WIRING: the registration names exactly the tools the decision covers, both dispatcher manifests
 * list the guard, and `settings.json` routes every covered tool to a manifest that lists it.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `vendored-edit-guard`. EL INCIDENTE: un módulo vendorizado
 * (`shell-command/shell-command.mjs`, de b100-am-ui, copiado por `vendored.mjs sync`) se editó EN SITIO en
 * `~/.claude/`; la comprobación de procedencia quedó en rojo día y medio porque nada frenó la edición ni
 * señaló la copia dueña. El mecanismo: una escritura a cualquier módulo de `VENDORED` se deniega y el
 * rechazo nombra la ruta dueña y la orden de resincronización. Espacio de estados: canal (herramientas de
 * edición y de shell), destino, papel (destino/origen), la propia sincronización (un proceso HIJO, que
 * `PreToolUse` nunca ve, sigue permitida), llamante (principal o subagente) y fallos propios. Más el
 * CABLEADO: el registro nombra exactamente las herramientas que decide, ambos manifiestos listan la
 * guardia y `settings.json` enruta cada herramienta a un manifiesto que la lista.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { payloadFor } = await import(pathToFileURL(path.join(HERE, '..', 'hook-payloads', 'payloads.mjs')).href);
const { alternativesOf } = await import(pathToFileURL(path.join(HERE, '..', 'hook-dispatch', 'manifest.mjs')).href);
const { VENDORED, SOURCE_ROOT_RECORDED } = await import(pathToFileURL(path.join(HERE, '..', 'vendored', 'vendored.mjs')).href);
const { evaluate, refusalText } = await import(pathToFileURL(path.join(HERE, 'guard.mjs')).href);
const { installRoots, vendoredWrites } = await import(pathToFileURL(path.join(HERE, 'decide.mjs')).href);

let checks = 0;
let failed = 0;

/**
 * One check. The condition is a thunk, so a throw while evaluating it is a FAILED check naming its cause,
 * never an uncaught crash that hides which decision broke.
 * @es Un check. La condición es una función: un throw al evaluarla es un check FALLIDO con su causa.
 */
function expect(label, condition) {
  let ok = false;
  let cause = '';

  try {
    ok = condition() === true;
  } catch (error) {
    cause = `  threw ${error.message}`;
  }

  checks += 1;

  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${cause}\n`);
}

const slash = (file) => file.split(path.sep).join('/');
// A root no real folder needs to match: the decision is about paths, never about the file system.
// @es Una raíz que no hace falta que exista: la decisión es sobre rutas, nunca sobre el sistema de ficheros.
const ROOT = path.resolve('/vendored-edit-guard-selftest/.claude');
const OTHER = path.resolve('/vendored-edit-guard-selftest/other/.claude');
const SIBLING = `${ROOT}-copy`;
const VENDORED_ONE = 'shell-command/shell-command.mjs';
const NOT_VENDORED = 'shell-command/not-vendored.mjs';
const MAIN_TRANSCRIPT = 'C:/Users/adrian.jimenez/.claude/projects/C--Users-adrian-jimenez/784bb328-d6e8-4651-9adc-d67137d7beb4.jsonl';
const SUBAGENT_TRANSCRIPT = 'C:/Users/adrian.jimenez/.claude/projects/C--Users-adrian-jimenez/784bb328-d6e8-4651-9adc-d67137d7beb4/subagents/agent-a8a1cf09d42b447f9.jsonl';
const inRoot = (root, relative) => path.join(root, ...relative.split('/'));

/** A main-session payload of an edit tool. @es Un payload de una herramienta de edición de la sesión principal. */
const editCall = (tool, field, file, cwd = ROOT) => ({ session_id: 'selftest', transcript_path: MAIN_TRANSCRIPT, cwd, tool_name: tool, tool_input: { [field]: file, old_string: 'a', new_string: 'b' } });
const edit = (file, cwd) => editCall('Edit', 'file_path', file, cwd);

/** A main-session payload of a shell tool, from the recording of that tool. @es Un payload de shell de la sesión principal, desde la grabación de esa herramienta. */
function shellCall(tool, command, cwd = ROOT) {
  const { agent_id: _agent, agent_type: _type, ...payload } = payloadFor(tool, command, { sessionId: 'selftest' });

  return { ...payload, transcript_path: MAIN_TRANSCRIPT, cwd };
}
const bash = (command, cwd) => shellCall('Bash', command, cwd);
const powershell = (command, cwd) => shellCall('PowerShell', command, cwd);

const offences = (payload, options = {}) => vendoredWrites(payload, { roots: [ROOT], ...options }).map((offence) => offence.relative);
const refused = (payload, options) => offences(payload, options).length > 0;
const verdictOf = (raw) => evaluate(typeof raw === 'string' ? raw : JSON.stringify(raw))?.hookSpecificOutput?.permissionDecision;

// --- THE EDIT TOOLS: the four, each refused on a vendored module.
for (const [tool, field] of [['Edit', 'file_path'], ['Write', 'file_path'], ['MultiEdit', 'file_path'], ['NotebookEdit', 'notebook_path']]) {
  expect(`${tool} on a vendored module is refused, and the module is named`, () => JSON.stringify(offences(editCall(tool, field, inRoot(ROOT, VENDORED_ONE)))) === JSON.stringify([VENDORED_ONE]));
}

expect('the decision reads the list from `VENDORED`: every module it lists is refused', () => VENDORED.length > 0 && VENDORED.every((relative) => JSON.stringify(offences(edit(inRoot(ROOT, relative)))) === JSON.stringify([relative])));
expect('a module of the install that is NOT vendored is allowed', () => !refused(edit(inRoot(ROOT, NOT_VENDORED))));
expect('the settings file of the install is allowed', () => !refused(edit(inRoot(ROOT, 'settings.json'))));
expect('the SAME relative path in the OWNER copy is allowed: that is the remedy', () => !refused(edit(inRoot(OTHER, VENDORED_ONE))));
expect('a sibling folder that shares the root prefix is allowed', () => !refused(edit(inRoot(SIBLING, VENDORED_ONE))));
expect('the root itself is no vendored module', () => !refused(edit(ROOT)));
expect('a relative file_path is resolved against the payload cwd: refused inside the root', () => refused(edit(VENDORED_ONE, ROOT)));
expect('a relative file_path is resolved against the payload cwd: allowed outside the root', () => !refused(edit(VENDORED_ONE, OTHER)));
expect('`..` segments are resolved before the comparison', () => refused(edit(`${ROOT}${path.sep}x${path.sep}..${path.sep}${VENDORED_ONE.split('/').join(path.sep)}`)));
expect('a path that leaves the root through `..` and comes back to the owner is allowed', () => !refused(edit(path.join(ROOT, '..', 'other', '.claude', VENDORED_ONE))));
expect('on Windows the letter case of a path does not hide the module', () => refused(edit(inRoot(ROOT, VENDORED_ONE.toUpperCase())), { platform: 'win32' }));
expect('on a case-sensitive platform another letter case is another file', () => !refused(edit(inRoot(ROOT, VENDORED_ONE.toUpperCase())), { platform: 'linux' }));
expect('with several roots (the install and `~/.claude`) a module under either is refused', () => refused(edit(inRoot(OTHER, VENDORED_ONE)), { roots: [ROOT, OTHER] }));

// --- THE SHELL CHANNEL: every write the shared lexer sees, refused on a vendored module.
const target = slash(inRoot(ROOT, VENDORED_ONE));
const SHELL_WRITES = [
  [`echo x > ${target}`, 'an output redirection'],
  [`echo x >> ${target}`, 'an appending redirection'],
  [`echo x | tee ${target}`, '`tee`'],
  [`sed -i s/a/b/ ${target}`, '`sed -i`'],
  [`cp /tmp/new.mjs ${target}`, '`cp` onto it'],
  [`mv /tmp/new.mjs ${target}`, '`mv` onto it']
];

for (const [command, label] of SHELL_WRITES) expect(`Bash: ${label} onto a vendored module is refused`, () => JSON.stringify(offences(bash(command))) === JSON.stringify([VENDORED_ONE]));

for (const [command, label] of [
  [`Set-Content -Path ${target} -Value x`, '`Set-Content`'],
  [`Out-File -FilePath ${target}`, '`Out-File`'],
  [`Copy-Item C:/tmp/new.mjs ${target}`, '`Copy-Item`']
]) {
  expect(`PowerShell: ${label} onto a vendored module is refused`, () => JSON.stringify(offences(powershell(command))) === JSON.stringify([VENDORED_ONE]));
}

expect('a relative redirection target is resolved against the payload cwd', () => refused(bash(`echo x > ${VENDORED_ONE}`, ROOT)));
expect('a `cd` earlier in the line moves the directory the target is resolved in', () => refused(bash(`cd ${slash(ROOT)} && echo x > ${VENDORED_ONE}`, OTHER)));
expect('a `cd` into the OWNER makes the same relative target an allowed write', () => !refused(bash(`cd ${slash(OTHER)} && echo x > ${VENDORED_ONE}`, ROOT)));
expect('the same write onto the OWNER copy is allowed', () => !refused(bash(`cp /tmp/new.mjs ${slash(inRoot(OTHER, VENDORED_ONE))}`)));
expect('a write onto a module that is NOT vendored is allowed', () => !refused(bash(`echo x > ${slash(inRoot(ROOT, NOT_VENDORED))}`)));
expect('a vendored module as the SOURCE of a `cp` is allowed', () => !refused(bash(`cp ${target} /tmp/copy.mjs`)));
expect('reading a vendored module is allowed', () => !refused(bash(`cat ${target}`)) && !refused(bash(`sed -n 1,5p ${target}`)) && !refused(bash(`rg foo ${target} > /dev/null`)));
expect('the path as DATA (an `echo` argument) is no write', () => !refused(bash(`echo ${target}`)));
expect('a redirection target nobody can resolve (a variable) is allowed: a stated tradeoff of the shared lexer', () => !refused(bash('echo x > "$FILE"')));
expect('every vendored module written by one line is named once each, in order', () => JSON.stringify(offences(bash(`echo x > ${slash(inRoot(ROOT, VENDORED[0]))} && cp a ${slash(inRoot(ROOT, VENDORED[1]))}`))) === JSON.stringify([VENDORED[0], VENDORED[1]]));
expect('a module written twice by one line is named once, by the way it was written first', () => {
  const found = vendoredWrites(bash(`echo x > ${target} && sed -i s/a/b/ ${target}`), { roots: [ROOT] });

  return found.length === 1 && found[0].relative === VENDORED_ONE && found[0].via === 'a shell redirection';
});

// --- `~` and the install's own roots: what the real hook runs against.
const HOME_CLAUDE = path.join(os.homedir(), '.claude');

expect('the roots are `~/.claude` and the folder this guard is installed in, each once', () => {
  const roots = installRoots();

  return roots.includes(HOME_CLAUDE) && new Set(roots).size === roots.length && roots.includes(path.resolve(HERE, '..'));
});
expect('the roots are `~/.claude` alone when the guard is installed there', () => JSON.stringify(installRoots({ home: path.dirname(ROOT), install: ROOT })) === JSON.stringify([ROOT]));
expect('`~/.claude/…` in a shell line is the install: refused', () => JSON.stringify(vendoredWrites(bash(`echo x > ~/.claude/${VENDORED_ONE}`), { roots: [HOME_CLAUDE] }).map((offence) => offence.relative)) === JSON.stringify([VENDORED_ONE]));
expect('the real roots refuse the real `~/.claude` module and allow the owner path', () => vendoredWrites(edit(path.join(HOME_CLAUDE, VENDORED_ONE))).length === 1 && vendoredWrites(edit(path.join(os.homedir(), ...SOURCE_ROOT_RECORDED.split('/').slice(1), VENDORED_ONE))).length === 0);

// --- THE SYNC: the command that writes the copies runs them in a CHILD process, so it stays allowed.
expect('`node ~/.claude/vendored/vendored.mjs sync` is allowed', () => !refused(bash('node ~/.claude/vendored/vendored.mjs sync'), { roots: [HOME_CLAUDE] }));
expect('`node <root>/vendored/vendored.mjs sync` is allowed', () => !refused(bash(`node ${slash(inRoot(ROOT, 'vendored/vendored.mjs'))} sync`)));
expect('`cd <root> && node vendored/vendored.mjs sync` is allowed', () => !refused(bash(`cd ${slash(ROOT)} && node vendored/vendored.mjs sync`, OTHER)));
expect('`vendored.mjs check` is allowed', () => !refused(bash(`node ${slash(inRoot(ROOT, 'vendored/vendored.mjs'))} check`)));

// --- NOT A WRITE TOOL: outside the decision.
expect('Read of a vendored module is allowed', () => !refused({ ...edit(inRoot(ROOT, VENDORED_ONE)), tool_name: 'Read' }));
expect('a tool that runs no shell and edits nothing is allowed', () => !refused({ ...bash(`echo x > ${target}`), tool_name: 'SendMessage' }));

// --- THE CALLER: main session and subagent alike.
expect('a subagent is refused too (by `agent_id`, by transcript, by both)', () => {
  const call = edit(inRoot(ROOT, VENDORED_ONE));

  return [{ ...call, agent_id: 'a8a1cf09d42b447f9' }, { ...call, transcript_path: SUBAGENT_TRANSCRIPT }, { ...call, agent_id: 'a8a1cf09d42b447f9', transcript_path: SUBAGENT_TRANSCRIPT }].every((payload) => refused(payload));
});

// --- ITS OWN FAILURES: the guard fails open and never refuses from a guess.
const ownCall = (file) => edit(path.join(HOME_CLAUDE, file));

expect('through `evaluate`, an Edit of a real vendored module is denied', () => verdictOf(ownCall(VENDORED_ONE)) === 'deny');
expect('through `evaluate`, a module that is not vendored is allowed', () => verdictOf(ownCall(NOT_VENDORED)) === undefined);
expect('through `evaluate`, a Bash write onto a real vendored module is denied', () => verdictOf(bash(`cp /tmp/new.mjs ~/.claude/${VENDORED_ONE}`)) === 'deny');
expect('a BOM in front of a VALID payload is still read', () => verdictOf(`﻿${JSON.stringify(ownCall(VENDORED_ONE))}`) === 'deny');
expect('not JSON, empty and BOM + garbage are allowed', () => ['NOT JSON AT ALL', '', '﻿NOT JSON'].every((raw) => verdictOf(raw) === undefined));
expect('a null tool_input, a missing and a non-string file_path are allowed', () => [{ ...ownCall(VENDORED_ONE), tool_input: null }, { ...ownCall(VENDORED_ONE), tool_input: {} }, { ...ownCall(VENDORED_ONE), tool_input: { file_path: 42 } }, { ...ownCall(VENDORED_ONE), tool_input: { file_path: '' } }].every((payload) => verdictOf(payload) === undefined));
expect('a non-string shell command is allowed', () => verdictOf({ ...bash('x'), tool_input: { command: 42 } }) === undefined);
expect('a payload that is not an object is allowed', () => ['null', '42', '"text"', '[]'].every((raw) => verdictOf(raw) === undefined));
expect('a throw inside the decision is allowed, never a refusal made from a guess', () => {
  const throwing = () => {
    throw new Error('the decision broke');
  };

  return evaluate(JSON.stringify(ownCall(VENDORED_ONE)), { decide: throwing }) === undefined && verdictOf(ownCall(VENDORED_ONE)) === 'deny';
});

// --- THE REFUSAL TEACHES THE REMEDY, in both languages: the owner path and the re-sync command.
const reason = refusalText([{ relative: VENDORED_ONE, via: 'the Edit tool' }]);
const [english, spanish = ''] = reason.split('@es ');
const OWNER_PATH = `${SOURCE_ROOT_RECORDED}/${VENDORED_ONE}`;
const SYNC_COMMAND = 'node ~/.claude/vendored/vendored.mjs sync';

expect('the refusal names the owner path in English', () => english.includes(OWNER_PATH) && OWNER_PATH === `~/Desktop/Projects/b100-am-ui/.claude/${VENDORED_ONE}`);
expect('the refusal names the owner path in Spanish', () => spanish.includes(OWNER_PATH));
expect('the refusal names the re-sync command in English', () => english.includes(SYNC_COMMAND));
expect('the refusal names the re-sync command in Spanish', () => spanish.includes(SYNC_COMMAND));
expect('the refusal names the installed copy and how it was written', () => english.includes(`~/.claude/${VENDORED_ONE}`) && english.includes('the Edit tool') && spanish.includes(`~/.claude/${VENDORED_ONE}`));
expect('the refusal says why: the provenance check goes red and the next sync overwrites the edit, in both languages', () => english.includes('EDITED IN THE KIT') && english.includes('overwrite') && spanish.includes('EDITADO EN EL KIT') && spanish.includes('sobrescribe'));
expect('the refusal carries the @es mirror, and the whole text is bilingual', () => reason.includes('@es VENDORED-EDIT GUARD RECHAZÓ') && english.startsWith('VENDORED-EDIT GUARD REFUSED'));
expect('the refusal lists every module the call writes, owner path included', () => {
  const both = refusalText([{ relative: VENDORED[0], via: 'a shell redirection' }, { relative: VENDORED[1], via: 'cp' }]);

  return both.includes(`${SOURCE_ROOT_RECORDED}/${VENDORED[0]}`) && both.includes(`${SOURCE_ROOT_RECORDED}/${VENDORED[1]}`) && both.includes('a shell redirection') && both.includes('cp');
});
expect('the denial through `evaluate` carries that refusal, named for the module', () => {
  const output = evaluate(JSON.stringify(ownCall(VENDORED_ONE)));

  return output.hookSpecificOutput.hookEventName === 'PreToolUse' && output.hookSpecificOutput.permissionDecisionReason.includes(`${SOURCE_ROOT_RECORDED}/${VENDORED_ONE}`) && output.hookSpecificOutput.permissionDecisionReason.includes('(the Edit tool)');
});
expect('the denial says how a shell line wrote the module', () => evaluate(JSON.stringify(bash(`sed -i s/a/b/ ~/.claude/${VENDORED_ONE}`))).hookSpecificOutput.permissionDecisionReason.includes('(sed -i)'));

// --- THE WIRING: the dispatcher runs this guard, for exactly the tools the decision covers.
const COVERED_TOOLS = ['Bash', 'Edit', 'MultiEdit', 'NotebookEdit', 'PowerShell', 'Write'];
const registration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
const manifestsDirectory = path.join(HERE, '..', 'hook-dispatch', 'manifests');
const settings = JSON.parse(readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8'));
const GUARD_ENTRY = '../../vendored-edit-guard/guard.mjs';
const manifestListing = (name) => JSON.parse(readFileSync(path.join(manifestsDirectory, name), 'utf8')).guards.includes(GUARD_ENTRY);
/** The manifest file names a settings command hands the dispatcher. @es Los manifiestos que un comando de settings entrega al dispatcher. */
const manifestsOf = (command) => (typeof command === 'string' ? command.split('"').filter((word) => word.endsWith('.json') && word.includes('/hook-dispatch/manifests/')).map((word) => path.basename(word)) : []);
const routedTo = (tool) => (settings.hooks?.PreToolUse ?? []).filter((entry) => alternativesOf(entry.matcher).includes(tool)).flatMap((entry) => entry.hooks.flatMap((hook) => manifestsOf(hook.command)));

expect('the registration names exactly the tools the decision covers', () => registration.registrations.length === 1 && registration.registrations[0].event === 'PreToolUse' && JSON.stringify([...alternativesOf(registration.registrations[0].matcher)].sort()) === JSON.stringify(COVERED_TOOLS));
expect('the shell manifest lists this guard', () => manifestListing('pretooluse-shell.json'));
expect('the authoring manifest lists this guard', () => manifestListing('pretooluse-authoring.json'));
expect('the registration explains itself', () => typeof registration.why === 'string' && registration.why.length > 40);

for (const tool of COVERED_TOOLS) expect(`settings.json routes ${tool} to a dispatcher manifest that lists this guard`, () => routedTo(tool).some((name) => manifestListing(name)));

// --- AS A HOOK: the process the harness would spawn without the dispatcher, stdin to stdout.
// @es COMO HOOK: el proceso que lanzaría el harness sin el dispatcher, de stdin a stdout.
const asHook = (payload) => execFileSync(process.execPath, [path.join(HERE, 'guard.mjs')], { input: JSON.stringify(payload), encoding: 'utf8' });

expect('run as a hook, a refusal is one JSON line on stdout', () => {
  const printed = asHook(ownCall(VENDORED_ONE)).trim();

  return printed.split('\n').length === 1 && JSON.parse(printed).hookSpecificOutput.permissionDecision === 'deny';
});
expect('run as a hook, an allowed call prints nothing', () => asHook(ownCall(NOT_VENDORED)) === '');

// --- END TO END through the dispatcher, the way the harness runs it. The dispatcher journals every block it
// says, so its process writes to a temp state directory and never to the live journal of any guard.
// @es DE PUNTA A PUNTA por el dispatcher. Su proceso escribe en un directorio de estado temporal, nunca en el journal vivo de una guardia.
const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'vendored-edit-guard-state-'));
const dispatch = (manifest, payload) => execFileSync(process.execPath, [path.join(HERE, '..', 'hook-dispatch', 'dispatch.mjs'), path.join(manifestsDirectory, manifest)], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: stateRoot } });

try {
  expect('an Edit of the real vendored module is DENIED through the authoring dispatcher', () => {
    const output = dispatch('pretooluse-authoring.json', ownCall(VENDORED_ONE));

    return output.includes('"deny"') && output.includes('VENDORED-EDIT GUARD REFUSED');
  });
  expect('a Bash `cp` onto the real vendored module is DENIED through the shell dispatcher', () => {
    const output = dispatch('pretooluse-shell.json', bash(`cp /tmp/new.mjs ~/.claude/${VENDORED_ONE}`));

    return output.includes('"deny"') && output.includes('VENDORED-EDIT GUARD REFUSED');
  });
  expect('an Edit of a module that is not vendored passes the authoring dispatcher', () => !dispatch('pretooluse-authoring.json', ownCall(NOT_VENDORED)).includes('VENDORED-EDIT GUARD'));
  expect('the sync command passes the shell dispatcher', () => !dispatch('pretooluse-shell.json', bash('node ~/.claude/vendored/vendored.mjs sync')).includes('VENDORED-EDIT GUARD'));
} finally {
  rmSync(stateRoot, { recursive: true, force: true });
}

process.stdout.write(`vendored-edit-guard selftest: ${checks - failed}/${checks} passed\n`);
process.exitCode = failed === 0 ? 0 : 1;
