#!/usr/bin/env node
/**
 * Self-test for the shared worker contract pointer. It proves the DECISION (which files a worker is pointed at,
 * from which source, for which project) on constructed projects, and the hook itself by spawning it with the
 * payload CAPTURED from the live harness (`fixtures/subagent-start.json`), so the proof cannot agree with the
 * hook by inventing a field the harness never sends. The last block asserts the wiring: the sidecar and the
 * registration in `settings.json`.
 *
 * @es Auto-test del puntero de contrato compartido para workers. Prueba la DECISIÓN (a qué ficheros se apunta
 * a un worker, desde qué fuente, para qué proyecto) en proyectos construidos, y el hook real lanzándolo con el
 * payload CAPTURADO del harness vivo (`fixtures/subagent-start.json`), para que la prueba no coincida con el hook
 * inventando un campo que el harness nunca envía. El último bloque afirma el cableado: el sidecar y el registro
 * en `settings.json`.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { importedFiles as readImports } from './claude-md-imports.mjs';
import { contractLocations as readLocations } from './contract-locations.mjs';
import { workerPointer as readPointer } from './worker-pointer.mjs';

isolateState('subagent-contract-pointer');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, 'start-hook.mjs');
const FLEET = path.resolve(HERE, '..');
const ROOT = mkdtempSync(path.join(tmpdir(), 'contract-pointer-'));
const CAPTURED = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'subagent-start.json'), 'utf8'));

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;

  if (condition) return;

  failures += 1;
  console.error(`FAIL: ${label}${detail === '' ? '' : ` -- ${detail}`}\n@es FALLO: ${label}`);
}

/**
 * Runs `read` and turns a throw into a value that fails the CHECK, so a broken module is reported as a failed
 * assertion and not as a crash of the whole run.
 * @es Corre `read` y convierte un lanzamiento en un valor que hace fallar el CHECK, para que un módulo roto se
 * informe como aserción fallida y no como caída de toda la corrida.
 */
const guarded = (read, fallback) => (...args) => {
  try {
    return read(...args);
  } catch (error) {
    return fallback(error instanceof Error ? error.message : String(error));
  }
};

const importedFiles = guarded(readImports, () => []);
const contractLocations = guarded(readLocations, (message) => ({ source: `threw: ${message}`, files: [] }));
const workerPointer = guarded(readPointer, (message) => `threw: ${message}`);

let counter = 0;

/** A project directory with the given files (relative path -> text). @es Un directorio de proyecto con los ficheros dados. */
function project(files) {
  counter += 1;

  const dir = path.join(ROOT, `p${String(counter)}`);

  mkdirSync(dir, { recursive: true });

  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), typeof text === 'string' ? text : JSON.stringify(text));
  }

  return dir;
}

const abs = (dir, relative) => path.join(dir, ...relative.split('/'));
const sameList = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
/** A real-shaped SubagentStart payload pointing at `cwd`. @es Un payload SubagentStart con forma real apuntando a `cwd`. */
const payloadAt = (cwd, overrides = {}) => ({ ...CAPTURED.payload, cwd, ...overrides });
const NO_ENV = { CLAUDE_PROJECT_DIR: '' };

// ---- the captured payload -----------------------------------------------------------------------------
check('the capture is a SubagentStart', CAPTURED.payload.hook_event_name === 'SubagentStart');
check('the capture carries the measured fields', ['session_id', 'transcript_path', 'cwd', 'prompt_id', 'agent_id', 'agent_type'].every((field) => typeof CAPTURED.payload[field] === 'string'));
check('the capture is an Explore agent, the case that does not load CLAUDE.md', CAPTURED.payload.agent_type === 'Explore');
check('the capture states where it came from', String(CAPTURED.provenance).startsWith('CAPTURED'));

// ---- the CLAUDE.md imports ----------------------------------------------------------------------------
// Every trap points at a file that EXISTS, so only the rule being tested can keep it out of the result: a
// missing target would be dropped by the existence filter and prove nothing about the rule.
// @es Cada trampa apunta a un fichero que EXISTE, para que solo la regla probada pueda dejarlo fuera: un
// destino inexistente lo descartaría el filtro de existencia y no probaría nada de la regla.
const importing = project({
  '.claude/AGENT-CONTRACT.md': 'contract',
  '.claude/notes/extra.md': 'extra',
  '.claude/fenced.md': 'fenced',
  '.claude/inline.md': 'inline',
  '.claude/real.md': 'real',
  '.claude/with space.md': 'spaced',
  '.claude/~/global.md': 'home',
  '.claude/abs-target.md': 'absolute'
});

writeFileSync(abs(importing, '.claude/CLAUDE.md'), [
  '# Project',
  '@AGENT-CONTRACT.md',
  '  @./notes/extra.md  ',
  '@es Solo local, no versionado.',
  '@HostListener',
  '@~/global.md',
  `@${abs(importing, '.claude/abs-target.md')}`,
  '@with space.md',
  '@notes',
  'Xreal.md',
  '@MISSING.md',
  '@AGENT-CONTRACT.md',
  '```',
  '@fenced.md',
  '```',
  'prose with @inline.md inside'
].join('\n'));

const imports = importedFiles(abs(importing, '.claude/CLAUDE.md'));

check('an @ import line resolves relative to the CLAUDE.md', imports.includes(abs(importing, '.claude/AGENT-CONTRACT.md')));
check('an import with a leading ./ and surrounding blanks resolves', imports.includes(abs(importing, '.claude/notes/extra.md')));
check('"@es text" is not an import', !imports.some((file) => file.endsWith('Solo')));
check('an @~ import (the owner global files) is not the project contract', !imports.some((file) => file.endsWith('global.md')));
check('an absolute import is skipped', !imports.some((file) => file.endsWith('abs-target.md')));
check('a line that is not an @ line is not an import', !imports.some((file) => file.endsWith('real.md')));
check('a path with a space is not an import (no space is the rule)', !imports.some((file) => file.endsWith('with space.md')));
check('a directory is not an imported file', !imports.some((file) => file.endsWith('notes')));
check('an import of a missing file is dropped (a decorator name is not a path)', !imports.some((file) => file.endsWith('MISSING.md') || file.endsWith('HostListener')));
check('an import inside a code fence is an example, not an import', !imports.some((file) => file.endsWith('fenced.md')));
check('an @ in the middle of prose is not an import', !imports.some((file) => file.endsWith('inline.md')));
check('a repeated import is listed once', imports.filter((file) => file.endsWith('AGENT-CONTRACT.md')).length === 1);
check('exactly the two real imports remain', imports.length === 2, JSON.stringify(imports));

// ---- the contract locations -----------------------------------------------------------------------------
const declared = project({
  '.claude/agent-contract/anchors.json': { english: ['LEDGER.md', 'rules', 'ABSENT.md'], spanish: ['AGENTS.md'], anchors: ['M1'] },
  'LEDGER.md': 'x',
  'rules/a.md': 'y',
  '.claude/CLAUDE.md': '@OTHER.md',
  '.claude/OTHER.md': 'z'
});
const fromAnchors = contractLocations(declared);

check('a usable anchors.json is the source', fromAnchors.source === 'anchors');
check('its english paths that exist are the files, a directory as itself', sameList(fromAnchors.files, [abs(declared, 'LEDGER.md'), abs(declared, 'rules')]), JSON.stringify(fromAnchors.files));
check('the spanish contract is not what a Claude Code worker is pointed at', !fromAnchors.files.some((file) => file.endsWith('AGENTS.md')));

const declaredNothingPresent = project({ '.claude/agent-contract/anchors.json': { english: ['GONE.md'], spanish: ['AGENTS.md'], anchors: ['M1'] }, '.claude/CLAUDE.md': '@OTHER.md', '.claude/OTHER.md': 'z' });

check('a declaration whose english files are not on this machine falls back to the imports', sameList(contractLocations(declaredNothingPresent).files, [abs(declaredNothingPresent, '.claude/OTHER.md')]) && contractLocations(declaredNothingPresent).source === 'claude-md');

const declaredBroken = project({ '.claude/agent-contract/anchors.json': '{ broken', '.claude/CLAUDE.md': '@OTHER.md', '.claude/OTHER.md': 'z' });

check('a broken anchors.json falls back to the imports instead of hiding the contract', sameList(contractLocations(declaredBroken).files, [abs(declaredBroken, '.claude/OTHER.md')]));

const rootClaudeMd = project({ 'CLAUDE.md': '@docs/CONTRACT.md', 'docs/CONTRACT.md': 'c' });

check('a CLAUDE.md at the project root is read when there is none under .claude', sameList(contractLocations(rootClaudeMd).files, [abs(rootClaudeMd, 'docs/CONTRACT.md')]));

const bothClaudeMd = project({ '.claude/CLAUDE.md': '@A.md', '.claude/A.md': 'a', 'CLAUDE.md': '@B.md\n@.claude/A.md', 'B.md': 'b' });

check('both CLAUDE.md files contribute, the tooling one first, a shared file once', sameList(contractLocations(bothClaudeMd).files, [abs(bothClaudeMd, '.claude/A.md'), abs(bothClaudeMd, 'B.md')]), JSON.stringify(contractLocations(bothClaudeMd).files));
check('a project with nothing has no contract files, which is not an error', contractLocations(project({})).files.length === 0);

// ---- the pointer ------------------------------------------------------------------------------------------
const imported = project({ '.claude/CLAUDE.md': '@AGENT-CONTRACT.md', '.claude/AGENT-CONTRACT.md': 'contract' });
const pointer = workerPointer(payloadAt(imported), NO_ENV);

check('the pointer names the contract file', pointer.includes(abs(imported, '.claude/AGENT-CONTRACT.md')));
check('the pointer tells the worker to read it when it is not in context', pointer.includes('READ those files'));
check('the pointer names Explore as the reason', pointer.includes('Explore agents do not load CLAUDE.md'));
check('the pointer carries the route rule', pointer.includes('ROUTE: tracked-odd') && pointer.includes('orchestrator owns'));
check('the pointer says a brief without ROUTE is direct', pointer.includes('A brief with no ROUTE line is "direct"'));
check('the pointer says never to touch a feature document unless ROUTE names it', pointer.includes('Never create or edit an ODD feature document'));
check('the pointer is bilingual', pointer.includes('@es') && pointer.includes('Regla de ruta'));
check('the pointer is a pointer, short of the 10000 characters the harness persists to a file', pointer.length < 3000, String(pointer.length));
check('the pointer is the same for a resume (another agent id)', workerPointer(payloadAt(imported, { agent_id: 'ZZZ', agent_type: 'general-purpose' }), NO_ENV) === pointer);
check('the project is found from a subdirectory', workerPointer(payloadAt(path.join(imported, 'src', 'deep')), NO_ENV) === pointer);
check('the project is found from CLAUDE_PROJECT_DIR when the cwd is elsewhere', workerPointer(payloadAt(path.join(ROOT, 'elsewhere')), { CLAUDE_PROJECT_DIR: imported }) === pointer);
check('the main checkout is found from inside a linked worktree', workerPointer(payloadAt(abs(imported, '.claude/worktrees/agent-x')), NO_ENV) === pointer);
check('a project with an anchors.json is pointed at its english contract', workerPointer(payloadAt(declared), NO_ENV).includes(abs(declared, 'LEDGER.md')));

// A declaration identifies the project before a CLAUDE.md does: a nested CLAUDE.md under a project that
// declares its contract does not become the project.
// @es Una declaración identifica al proyecto antes que un CLAUDE.md: uno anidado bajo un proyecto que declara
// su contrato no pasa a ser el proyecto.
const nested = project({ '.claude/agent-contract/anchors.json': { english: ['LEDGER.md'], spanish: ['AGENTS.md'], anchors: ['M1'] }, 'LEDGER.md': 'l', 'sub/CLAUDE.md': '@OWN.md', 'sub/OWN.md': 'o' });
const nestedPointer = workerPointer(payloadAt(path.join(nested, 'sub')), NO_ENV);

check('a declared project wins over a nested CLAUDE.md', nestedPointer.includes(abs(nested, 'LEDGER.md')) && !nestedPointer.includes('OWN.md'));

const unknown = workerPointer(payloadAt(path.join(ROOT, 'nowhere')), NO_ENV);

check('with no project the worker is told none was found, and still gets the route rule', unknown.includes('No project contract file was found') && unknown.includes('ROUTE: direct'));
check('with no project the searched directory is named', unknown.includes('nowhere'));
check('a project with a CLAUDE.md that imports nothing is told none was found', workerPointer(payloadAt(project({ 'CLAUDE.md': 'plain' })), NO_ENV).includes('No project contract file was found'));
check('a payload with no cwd and no environment still yields the route rule', workerPointer({}, NO_ENV).includes('ROUTE: direct'));

// ---- the hook, spawned with the captured payload ------------------------------------------------------------
function spawnHook(input, env = {}) {
  const result = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '', ...env } });

  return { status: result.status, out: result.stdout };
}

const spawned = spawnHook(JSON.stringify(payloadAt(imported)));
const envelope = spawned.out === '' ? {} : JSON.parse(spawned.out);

check('the hook exits 0', spawned.status === 0);
check('the hook answers for the SubagentStart event', envelope.hookSpecificOutput?.hookEventName === 'SubagentStart');
check('the hook delivers the pointer as additionalContext', envelope.hookSpecificOutput?.additionalContext === pointer);
check('the hook reads a payload that starts with a byte-order mark', spawnHook(`\uFEFF${JSON.stringify(payloadAt(imported))}`).out.includes('AGENT-CONTRACT.md'));
check('the hook honours CLAUDE_PROJECT_DIR', spawnHook(JSON.stringify(payloadAt(path.join(ROOT, 'elsewhere'))), { CLAUDE_PROJECT_DIR: imported }).out.includes('AGENT-CONTRACT.md'));
check('the hook prints nothing and exits 0 on a payload that is not JSON', spawnHook('not json').out === '' && spawnHook('not json').status === 0);
check('the hook prints nothing and exits 0 on an empty payload', spawnHook('').out === '' && spawnHook('').status === 0);

// ---- the wiring ---------------------------------------------------------------------------------------------
const sidecar = JSON.parse(readFileSync(`${HOOK}.hook-registration.json`, 'utf8'));
const settings = JSON.parse(readFileSync(path.join(FLEET, 'settings.json'), 'utf8'));
const registered = (settings.hooks?.SubagentStart ?? []).flatMap((entry) => entry.hooks ?? []).map((hook) => hook.command);

check('the sidecar declares the SubagentStart event', sidecar.registrations?.[0]?.event === 'SubagentStart');
check('settings.json registers the hook on SubagentStart', registered.some((command) => String(command).includes('subagent-contract-pointer/start-hook.mjs')));
check('settings.json registers it exactly once', registered.filter((command) => String(command).includes('subagent-contract-pointer/start-hook.mjs')).length === 1);

rmSync(ROOT, { recursive: true, force: true });

console.log(`${String(checks - failures)}/${String(checks)} checks passed. @es ${String(checks - failures)}/${String(checks)} comprobaciones pasaron.`);
process.exit(failures === 0 ? 0 : 1);
