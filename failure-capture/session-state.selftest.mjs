#!/usr/bin/env node
/**
 * Proof that the state of one session is never shared with, or overwritten by, another live session (K2 and K3 of
 * the failure-capture audit), driven end to end in a constructed home with a copy of the real loop:
 *
 *   K2  two sessions record a capture one after the other; the turn guard of the FIRST must still see its stamp
 *       (the single `last-capture.json` of the earlier code held only the last session's, so the first was blocked
 *       for a capture it had recorded). A session that recorded nothing is still blocked.
 *   K3  two sessions' turn guards run at the same time, one of them slow to write its state back after reading it
 *       (a real child process held after its read); the other's cooldown must survive (the earlier single
 *       `guard-state.json` was read-modified-written whole, so the slow writer erased the other session's cooldown
 *       and its second end of turn was blocked again).
 *
 * @es Prueba de que el estado de una sesión nunca se comparte con otra sesión viva ni lo pisa otra (K2 y K3 de la
 * auditoría de failure-capture), de extremo a extremo en un home construido con una copia del lazo real:
 *
 *   K2  dos sesiones registran una captura una tras otra; el guard de turno de la PRIMERA debe seguir viendo su
 *       sello (el único `last-capture.json` anterior guardaba solo el de la última sesión, y la primera se
 *       bloqueaba por una captura que sí había registrado). Una sesión que no registró nada sigue bloqueada.
 *   K3  los guards de turno de dos sesiones corren a la vez, uno lento en devolver su estado tras leerlo (un
 *       proceso hijo real retenido tras su lectura); el cooldown de la otra debe sobrevivir (el único
 *       `guard-state.json` anterior se leía-modificaba-escribía entero, así que el lento borraba el cooldown de
 *       la otra sesión y su segundo fin de turno se bloqueaba otra vez).
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { fileNameOf } from './session-state.mjs';

isolateState('failure-capture');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(path.join(os.tmpdir(), 'session-state-selftest-'));
// Removed on every exit, a throw included. @es Se elimina en toda salida, también ante una excepción.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 400)}`));

// --- the file names ------------------------------------------------------------------------------------
{
  const names = ['a|orchestrator', 'a_orchestrator', 'a/orchestrator', '..', '.', 'x'.repeat(300), `${'x'.repeat(299)}y`].map(fileNameOf);

  check('no id can reach outside its directory or name a directory', names.every((name) => !name.includes('/') && !name.includes('\\') && !name.includes('|') && name !== '.' && name !== '..'), names.join(' '));
  check('different ids have different names, ids too long for a name included', new Set(names).size === names.length, names.join(' '));
  check('no name is longer than a file name may reasonably be', names.every((name) => name.length <= 120), names.map((name) => name.length).join(' '));
  check('the same id always has the same name', fileNameOf('sesion-a|orchestrator') === fileNameOf('sesion-a|orchestrator'));

  // J-4: the characters `encodeURIComponent` leaves raw that Windows forbids (`*`) or that are risky in a path or a
  // shell (`'`, `(`, `)`, `!`, `~`) are encoded too, each one, to its own %XX. @es Los caracteres que
  // `encodeURIComponent` deja crudos y que Windows prohíbe (`*`) o son arriesgados se codifican también, cada uno.
  const risky = { '*': '%2A', "'": '%27', '(': '%28', ')': '%29', '!': '%21', '~': '%7E' };

  for (const [character, encoded] of Object.entries(risky)) {
    const name = fileNameOf(`s${character}x`);

    check(`J-4: "${character}" never reaches a file name, it is spelled ${encoded}`, name === `s${encoded}x`, name);
  }

  check('J-4: every risky character together still gives one distinct, safe name', fileNameOf("a*'()!~b") === 'a%2A%27%28%29%21%7Eb', fileNameOf("a*'()!~b"));
  check('J-4: a dot is still spelled %2E', fileNameOf('a.b') === 'a%2Eb', fileNameOf('a.b'));
}

// --- a constructed world with a copy of the real loop -------------------------------------------------
const LESSON = 'I asserted a number from memory and it was wrong, root cause: I never measured it -> RULE: measure it before stating it';
const MARKED = 'Me equivoqué: el número era falso.';
const repo = path.join(scratch, 'repo');
const home = path.join(scratch, 'home');
const loop = path.join(repo, '.claude', 'failure-capture');
const env = worldEnv(home, { loop });

mkdirSync(path.join(loop, 'state'), { recursive: true });
mkdirSync(path.join(home, '.claude'), { recursive: true });
provisionLoop(loop);
writeFileSync(path.join(repo, '.claude', 'CLAUDE.md'), '# Project\n', 'utf8');

/** Records a capture as `session`, through the real CLI. @es Registra una captura como `session`, con el CLI real. */
const capture = (session, key) => execFileSync(process.execPath, [path.join(loop, 'capture.mjs'), 'capture', '--key', key, '--scope', 'global', '--actor', 'orchestrator', '--session', session, '--lesson', LESSON], { cwd: repo, env, stdio: 'pipe', timeout: 60_000 });

/** The end of a turn of `session` with a correction marker, through the real turn guard: `{ blocked }`. @es El fin de turno de `session` con un marcador, con el guard real. */
function stop(session, { delayMs = 0, mark } = {}) {
  return new Promise((resolve) => {
    const delay = delayMs > 0 ? { FC_DELAY_MATCH: 'guard-state', FC_DELAY_MS: String(delayMs), FC_DELAY_MARK: mark } : {};
    const flags = delayMs > 0 ? ['--require', path.join(HERE, 'read-delay.preload.cjs')] : [];
    const child = spawn(process.execPath, [...flags, path.join(loop, 'turn-guard.mjs')], { cwd: repo, env: { ...env, ...delay }, stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';

    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('exit', (code) => resolve({ code, blocked: out.trim() !== '' && JSON.parse(out.trim()).decision === 'block' }));
    child.stdin.end(JSON.stringify({ hook_event_name: 'Stop', session_id: session, cwd: repo, stop_hook_active: false, last_assistant_message: MARKED }));
  });
}

// --- K2 ------------------------------------------------------------------------------------------------
capture('sesion-a', 'k2-first-lesson');
capture('sesion-b', 'k2-second-lesson');

{
  const first = await stop('sesion-a');
  const second = await stop('sesion-b');
  const none = await stop('sesion-c');

  check('K2: the first session still sees its stamp after a second session recorded a capture', first.code === 0 && first.blocked === false, JSON.stringify(first));
  check('K2: the second session sees its own stamp', second.code === 0 && second.blocked === false, JSON.stringify(second));
  check('K2: NEAR MISS: a session that recorded nothing is still blocked', none.code === 0 && none.blocked === true, JSON.stringify(none));
}

// --- K3 ------------------------------------------------------------------------------------------------
{
  // Session D is slow: it has read the shared cooldown state and is held before it writes. Session E's whole turn
  // end runs meanwhile. Afterwards E ends a second turn inside its cooldown, and must not be blocked again.
  // @es La sesión D es lenta: ya leyó el estado de cooldown y se la retiene antes de escribir. Mientras tanto
  // corre entero el fin de turno de E. Después E termina un segundo turno dentro de su cooldown y no debe bloquearse otra vez.
  const mark = path.join(scratch, 'slow-read.mark');
  const slow = stop('sesion-d', { delayMs: 1500, mark });

  for (let waited = 0; !existsSync(mark) && waited < 10_000; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));

  const fast = await stop('sesion-e');

  await slow;

  const again = await stop('sesion-e');

  check('K3: the fast session is blocked once, by its first end of turn', fast.blocked === true, JSON.stringify(fast));
  check('K3: its cooldown survives a slow session writing its own state back afterwards', again.blocked === false && again.code === 0, JSON.stringify(again));
  check('K3: each session keeps a state file of its own', existsSync(path.join(loop, 'state', 'guard-state')) && readdirSync(path.join(loop, 'state', 'guard-state')).length >= 2, readdirSync(path.join(loop, 'state')).join(','));
}

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture session state selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
