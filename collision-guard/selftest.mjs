#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for the collision guard — `collision-fixed-by-deleting-unread-side`.
 *
 * THE STATE SPACE IS THE INDEX'S, and a real one is built rather than described: a repository with a
 * real merge in progress, carrying every shape of conflict this decision ranges over.
 *
 *   BOTH SIDES CHANGED the same file  -> refused whichever side is kept, because the other one holds
 *                                        changes the base did not have.
 *   ADD/ADD, no merge base            -> refused: every byte of the dropped file is unique.
 *   MODIFY/DELETE, dropped side gone  -> ALLOWED: there is no content to lose, only a deletion to
 *                                        decide, which is a judgement and not an unread loss.
 *   NOT CONFLICTED AT ALL             -> allowed.
 *   A MIX under one `.`               -> refused, and the refusal names ONLY the lossy paths.
 *
 * AND THE HALF THAT KEEPS IT ALIVE: a guard on `git checkout` that refuses legitimate work is off the
 * machine within the hour, so the allowed cases include the daily spellings — `git checkout <branch>
 * -- <path>`, a checkout with no side flag at all, a command that only MENTIONS one in a heredoc or an
 * echoed string, and a directory the line's own `cd` makes unknowable, which is measured as unknown
 * rather than guessed.
 *
 * @es PRUEBA DE DISCRIMINACIÓN del guard de colisiones. El espacio de estados es el del ÍNDICE y se
 * CONSTRUYE de verdad: un repositorio con un merge en curso y cada forma de conflicto. Se rechaza
 * cuando el lado descartado tiene contenido que la base no tenía (incluido add/add sin base); se deja
 * pasar cuando no hay blob que perder, cuando no hay conflicto, y en todas las formas cotidianas — otra
 * rama con `--`, sin bandera de lado, una MENCIÓN en un heredoc, y un directorio no conocible.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { errorsFile } from './guard.mjs';

// Every guard this selftest spawns keeps its state in a temp directory: never the live one a real session
// reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza guarda su estado en un directorio temporal: nunca en el vivo que
// lee una sesión real, ni con líneas de una corrida anterior.
isolateState('collision-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');

/** How many malfunctions this guard had recorded BEFORE this run, so the assertion below is a DELTA. @es Cuántos fallos había ANTES. */
const errorsBefore = existsSync(errorsFile()) ? readFileSync(errorsFile(), 'utf8').split('\n').filter((line) => line.length > 0).length : 0;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const scratch = mkdtempSync(path.join(tmpdir(), 'collision-guard-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
const repo = path.join(scratch, 'repo');
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (file, content) => writeFileSync(path.join(repo, file), content, 'utf8');

// ── a repository with a REAL merge in progress ─────────────────────────────────────────────────────
mkdirSync(repo, { recursive: true });
git('init', '-q', '-b', 'develop');
git('config', 'user.email', 'selftest@example.invalid');
git('config', 'user.name', 'selftest');
git('config', 'core.hooksPath', path.join(scratch, 'no-hooks'));

write('scripts.md', '| command | description |\n| lint | runs eslint |\n');
write('deleted-by-them.ts', 'export const kept = 1;\n');
write('untouched.ts', 'export const quiet = true;\n');
git('add', '-A');
git('commit', '-q', '-m', 'chore: seed');

git('checkout', '-q', '-b', 'theirs');
write('scripts.md', '| command | description |\n| lint | runs eslint with --max-warnings 0, and the = is load-bearing |\n');
write('both-added.ts', 'export const theirs = 1;\n');
rmSync(path.join(repo, 'deleted-by-them.ts'));
git('add', '-A');
git('commit', '-q', '-m', 'docs: their paragraph');

git('checkout', '-q', 'develop');
write('scripts.md', '| command | description |\n| lint | runs eslint over the staged set |\n');
write('both-added.ts', 'export const ours = 2;\n');
write('deleted-by-them.ts', 'export const kept = 2;\n');
git('add', '-A');
git('commit', '-q', '-m', 'docs: our paragraph');

try {
  git('merge', '--no-commit', 'theirs');
} catch {
  /* a merge that stops in conflict is exactly the state under test */
}

// A FOURTH conflicted path, built with plumbing because no ordinary merge produces it and the clause
// it pins is real: a conflicted entry whose DROPPED side is byte-identical to the merge base. Taking
// the other side then loses nothing at all, and a guard that refused it would be refusing a resolution
// that cannot lose anything — the direction that gets a guard switched off.
// @es Una CUARTA ruta en conflicto, construida con fontanería porque ningún merge corriente la produce
// y la cláusula que fija es real: el lado DESCARTADO es idéntico a la base, así que no se pierde nada.
const baseBlob = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: 'export const same = 1;\n', encoding: 'utf8' }).trim();
const oursBlob = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: 'export const same = 2;\n', encoding: 'utf8' }).trim();

execFileSync('git', ['-C', repo, 'update-index', '--index-info'], {
  input: [
    `100644 ${baseBlob} 1\tonly-ours-changed.ts`,
    `100644 ${oursBlob} 2\tonly-ours-changed.ts`,
    `100644 ${baseBlob} 3\tonly-ours-changed.ts`,
    ''
  ].join('\n'),
  encoding: 'utf8'
});

const conflicted = git('ls-files', '--unmerged').trim();

check('the fixture really is mid-merge, with four conflicted paths of four different shapes', new Set(conflicted.split('\n').map((line) => line.slice(line.indexOf('\t') + 1))).size, 4);

// ── the guard, over that index ─────────────────────────────────────────────────────────────────────
function run(command, { tool = 'Bash', cwd = repo } = {}) {
  const payload = JSON.stringify({ session_id: 'collision-guard-selftest', cwd, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command } });

  try {
    const out = execFileSync(process.execPath, [GUARD], { input: payload, encoding: 'utf8' });

    return { verdict: out.includes('"deny"') ? 'deny' : 'allow', out, code: 0 };
  } catch (error) {
    return { verdict: 'error', out: `${error?.stdout ?? ''}`, code: typeof error?.status === 'number' ? error.status : 'did-not-run' };
  }
}

// --- REFUSED: the dropped side holds what the base did not.
{
  const refusal = run('git checkout --ours -- scripts.md');

  check('keeping OURS over a file both sides changed is refused', refusal.verdict, 'deny');
  check('...and the refusal names the path', refusal.out.includes('scripts.md'), true);
  check('...and prints the diff that reads the dropped side first', refusal.out.includes('diff :1:scripts.md :3:scripts.md'), true);
}

check('keeping THEIRS over the same file is refused too — the direction is not what decides', run('git checkout --theirs -- scripts.md').verdict, 'deny');
{
  const refusal = run('git checkout --ours -- both-added.ts');

  check('an add/add path has no base, so every byte of the dropped side is unique', refusal.verdict, 'deny');
  check('...and the refusal says THAT, not the generic reason — a refusal that explains poorly gets routed around', refusal.out.includes('created this file independently'), true);
}
check('`git restore --ours` is the same resolution by another name', run('git restore --ours scripts.md').verdict, 'deny');
check('a whole-tree `.` take is refused when ANY path under it would lose content', run('git checkout --ours .').verdict, 'deny');
check('the PowerShell spelling is decided too', run('git checkout --ours -- scripts.md', { tool: 'PowerShell' }).verdict, 'deny');
check('a `cd` into the repository from elsewhere is followed', run(`cd "${repo.split('\\').join('/')}" && git checkout --ours -- scripts.md`, { cwd: scratch }).verdict, 'deny');

// --- ALLOWED: nothing would be lost, or nothing is being resolved.
check('NEAR MISS: the dropped side DELETED the file — no content to lose, only a deletion to judge', run('git checkout --ours -- deleted-by-them.ts').verdict, 'allow');
check('NEAR MISS: the dropped side is IDENTICAL to the merge base, so keeping ours loses nothing', run('git checkout --ours -- only-ours-changed.ts').verdict, 'allow');
check('...while keeping THEIRS over that same path drops the only change there is', run('git checkout --theirs -- only-ours-changed.ts').verdict, 'deny');
check('NEAR MISS: an invocation naming no path resolves nothing (git itself rejects it)', run('git checkout --ours').verdict, 'allow');
check('DATA, NOT COMMAND: the words unquoted after `echo` — only COMMAND POSITION decides', run('echo git checkout --ours -- scripts.md >> runbook.md').verdict, 'allow');
check('NEAR MISS: a path that is not conflicted at all', run('git checkout --ours -- untouched.ts').verdict, 'allow');
check('NEAR MISS: a checkout from another branch is not a side-take', run('git checkout develop -- scripts.md').verdict, 'allow');
check('NEAR MISS: a checkout with no side flag', run('git checkout -- scripts.md').verdict, 'allow');
check('NEAR MISS: a branch switch', run('git checkout develop').verdict, 'allow');
check('DATA, NOT COMMAND: the shape inside a heredoc body is being written, not run', run("cat <<'EOF' >> runbook.md\ngit checkout --ours -- scripts.md\nEOF").verdict, 'allow');
check('DATA, NOT COMMAND: the shape inside a quoted string', run('echo "git checkout --ours -- scripts.md" >> runbook.md').verdict, 'allow');
check('the directory is unknowable, so nothing was measured and nothing is refused', run('cd "$TARGET" && git checkout --ours -- scripts.md', { cwd: scratch }).verdict, 'allow');
check('a repository git cannot be asked about', run('git checkout --ours -- scripts.md', { cwd: path.join(scratch, 'no-such-directory') }).verdict, 'allow');
check('an ordinary command that touches no conflict', run('git status --porcelain').verdict, 'allow');

// --- ONCE RESOLVED AS A UNION, the same command passes: the guard blocks a LOSS, not a resolution.
write('scripts.md', '| command | description |\n| lint | runs eslint with --max-warnings 0, and the = is load-bearing; over the staged set |\n');
git('add', 'scripts.md');

check('after the union is staged, the path is no longer conflicted and the take passes', run('git checkout --ours -- scripts.md').verdict, 'allow');

// --- FAIL OPEN on anything malformed.
for (const [label, input] of [['garbage', 'NOT JSON AT ALL'], ['empty', ''], ['BOM + garbage', '\ufeffNOT JSON']]) {
  let out = '';
  let code = 0;

  try {
    out = execFileSync(process.execPath, [GUARD], { input, encoding: 'utf8' });
  } catch (error) {
    code = typeof error?.status === 'number' ? error.status : 'did-not-run';
    out = `${error?.stdout ?? ''}`;
  }

  check(`fails open on ${label}`, `${String(code)}/${out.includes('"deny"') ? 'deny' : 'allow'}`, '0/allow');
}

// --- NOTHING DEGRADED INVISIBLY. Every case above ran through the real shim, whose catch-all allows
//     the command and RECORDS the malfunction. If any of those verdicts came from a crash rather than
//     from a decision, this delta is non-zero — which is how "the refusal text threw and the guard
//     silently allowed" stops being indistinguishable from a clean pass.
//     @es NADA SE DEGRADÓ EN SILENCIO: si algún veredicto vino de un crash y no de una decisión, este
//     delta no es cero.
{
  const after = existsSync(errorsFile()) ? readFileSync(errorsFile(), 'utf8').split('\n').filter((line) => line.length > 0).length : 0;

  check('the guard recorded no malfunction of its own across every case above', after - errorsBefore, 0);
}

// --- THE WIRING: the tools the decision covers are the ones the declaration registers.
{
  const declaration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const matcher = declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher;

  check('the declaration registers both shells, which the decision covers', matcher, 'Bash|PowerShell');
}

process.stdout.write(`collision-guard selftest: ${String(passed)} passed, ${String(failures.length)} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
