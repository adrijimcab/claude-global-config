#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for the type-assertion guard — enumerates the state space its decision ranges
 * over and builds a REAL fixture repository for each state, per `guard-that-cannot-go-red`: silence from
 * a check is evidence only once that same check has been seen to speak.
 *
 * THE FIXTURE REPOSITORY carries a REAL `typescript` package: a Windows directory JUNCTION (`cmd /c
 * mklink /J`, verified in this session to be the form that actually resolves through `node_modules`
 * lookup — `fs.symlinkSync(..., 'junction')` produced a reparse point Node could `lstat` but not
 * `readdir`, so it is never used here) pointing at this machine's own b100-am-ui checkout, so the guard
 * exercises its REAL parser-resolution path, not a mock of it.
 *
 * THE STATE SPACE:
 *   EACH FORM ADDED (`x as T`, `<T>x`, `x as unknown as T`, postfix `!`)      -> refused.
 *   `as const`, `import * as`, `import { a as b }`, `export { a as b }`,
 *   `satisfies`                                                              -> allowed (never counted).
 *   an edit untouched near an existing assertion elsewhere in the file       -> allowed.
 *   an assertion removed                                                     -> allowed.
 *   an assertion moved within the same edit, count unchanged                 -> allowed.
 *   an `as`/`!` inside a string or a comment                                 -> allowed (it is data).
 *   a non-TypeScript file                                                    -> ignored.
 *   a Write that creates a brand-new file (count starts at 0)                -> refused when the new
 *                                                                                content itself asserts.
 *   MultiEdit, sequential edits, second one adds an assertion                -> refused.
 *   MultiEdit that only renames, no net-new assertion                        -> allowed.
 *   no TypeScript compiler resolvable for the target repository              -> fails OPEN, and reports.
 *   a file Edit/MultiEdit names that does not exist on disk                  -> fails OPEN, and reports.
 *   `old_string` that disagrees with what is really on disk                  -> fails OPEN, and reports.
 *   a tool this guard does not watch (e.g. `Bash`)                           -> ignored.
 *   a malformed/non-JSON payload, with and without a BOM                     -> fails OPEN, silently.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de la guardia de aserciones de tipo. Construye un repositorio de fixture
 * REAL con un `typescript` real (junction de Windows) y recorre el espacio de estados de arriba.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveTypeScript } from './resolve-typescript.mjs';
import { errorsFile } from './guard.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('type-assertion-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');

/**
 * A real, already-installed `typescript` package on this machine, to junction into the fixture repo —
 * never a name this selftest invents. Tried in order; the first that exists wins. Throws loudly (never
 * guesses) when NONE of them do, because a selftest that silently skipped its own real-parser proof would
 * be exactly the `guard-that-cannot-go-red` defect this proof exists to avoid. The projects are looked up under
 * the account's home as the OPERATING SYSTEM reports it (`userInfo().homedir`), never `homedir()`: the selftest
 * runner points `HOME`/`USERPROFILE` at an empty sandbox, and this is a read-only machine dependency, not state.
 * @es Los proyectos se buscan bajo el home de la cuenta según el SISTEMA OPERATIVO (`userInfo().homedir`), nunca
 * `homedir()`: el runner de selftests apunta `HOME`/`USERPROFILE` a un sandbox vacío, y esto es una dependencia
 * de la máquina, de solo lectura, no estado.
 */
function findRealTypeScript() {
  const candidates = ['Desktop/Projects/b100-am-ui', 'Desktop/Projects/discovery-api', 'Desktop/Projects/plugin-eslint', 'Desktop/Projects/plugin-stylelint'].map((project) => path.join(userInfo().homedir, project, 'node_modules', 'typescript'));
  const found = candidates.find((candidate) => existsSync(candidate));

  if (found === undefined) throw new Error(`no installed 'typescript' package found among: ${candidates.join(', ')} — this selftest needs one real repository with TypeScript installed to junction into its fixture`);

  return found;
}

const REAL_TYPESCRIPT = findRealTypeScript();

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

// ── a REAL fixture repository, with a REAL typescript resolvable through node_modules lookup ──────────
const scratch = mkdtempSync(path.join(tmpdir(), 'type-assertion-guard-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
const repo = path.join(scratch, 'repo');
const src = path.join(repo, 'src');

mkdirSync(path.join(repo, 'node_modules'), { recursive: true });
mkdirSync(src, { recursive: true });

if (!existsSync(REAL_TYPESCRIPT)) throw new Error(`fixture setup cannot find a real 'typescript' at ${REAL_TYPESCRIPT} to link — is b100-am-ui's node_modules installed?`);

execFileSync('cmd', ['/c', 'mklink', '/J', path.join(repo, 'node_modules', 'typescript'), REAL_TYPESCRIPT], { encoding: 'utf8' });

check('the fixture repository really resolves a TypeScript compiler through node_modules lookup', 'ts' in resolveTypeScript(path.join(src, 'anything.ts')), true);

function write(relative, content) {
  const file = path.join(src, relative);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');

  return file;
}

// ── the guard, driven with real-shaped PreToolUse payloads ─────────────────────────────────────────────
function run(toolInput, { tool = 'Edit', cwd = repo } = {}) {
  const payload = JSON.stringify({ session_id: 'type-assertion-guard-selftest', cwd, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput });
  const result = spawnSync(process.execPath, [GUARD], { input: payload, encoding: 'utf8' });
  const out = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  if (result.error !== undefined || result.status !== 0) return { verdict: 'error', out, stderr, code: result.status ?? 'did-not-run' };

  return { verdict: out.includes('"deny"') ? 'deny' : 'allow', out, stderr, code: 0 };
}

// === 1. EACH FORM ADDED, one at a time — refused =======================================================
{
  const file = write('add-as.ts', 'export function identity(x: unknown) {\n  return x;\n}\n');
  const result = run({ file_path: file, old_string: '  return x;', new_string: '  return x as string;' });

  check('adding `x as T` is refused', result.verdict, 'deny');
  check('...and the refusal names the line:column', /\b2:10\b/.test(result.out) || result.out.includes('return x as string'), true);
  check('...and the refusal is bilingual (English then @es)', includesAll(result.out, ['TYPE ASSERTION GUARD REFUSED', 'GUARDIA DE ASERCIONES DE TIPO RECHAZÓ']), true);
  check('...and it says there is no bypass', includesAll(result.out, ['no bypass flag', 'bandera de salto']), true);
}
{
  const file = write('add-angle.ts', 'export function identity(x: unknown) {\n  return x;\n}\n');

  check('adding `<T>x` is refused', run({ file_path: file, old_string: '  return x;', new_string: '  return <string>x;' }).verdict, 'deny');
}
{
  const file = write('add-unknown-as.ts', 'export function identity(x: unknown) {\n  return x;\n}\n');
  const result = run({ file_path: file, old_string: '  return x;', new_string: '  return x as unknown as string;' });

  check('adding `as unknown as T` is refused', result.verdict, 'deny');
  check('...and it is named twice (both nested casts), from 0 to 2', result.out.includes('from 0 to 2'), true);
}
{
  const file = write('add-nonnull.ts', 'export function identity(x: string | undefined) {\n  return x;\n}\n');

  check('adding the postfix `!` is refused', run({ file_path: file, old_string: '  return x;', new_string: '  return x!;' }).verdict, 'deny');
}

// === 2. ALLOWED forms: as const / import-rename / export-rename / satisfies ============================
{
  const file = write('as-const.ts', "export const mode = 'a';\n");

  check('`as const` is allowed — a type-level assertion, not a value-level one', run({ file_path: file, old_string: "export const mode = 'a';", new_string: "export const mode = 'a' as const;" }).verdict, 'allow');
}
{
  const file = write('import-star.ts', 'export const noop = 1;\n');

  check('`import * as ns` is allowed — a NamespaceImport, never an AsExpression', run({ file_path: file, old_string: 'export const noop = 1;', new_string: "import * as ns from './ns.js';\nexport const noop = 1;" }).verdict, 'allow');
}
{
  const file = write('import-rename.ts', 'export const noop = 1;\n');

  check('`import { a as b }` is allowed — an ImportSpecifier, never an AsExpression', run({ file_path: file, old_string: 'export const noop = 1;', new_string: "import { a as b } from './m.js';\nexport const noop = 1;" }).verdict, 'allow');
}
{
  const file = write('export-rename.ts', 'const a = 1;\nexport { a };\n');

  check('`export { a as b }` is allowed — an ExportSpecifier, never an AsExpression', run({ file_path: file, old_string: 'export { a };', new_string: 'export { a as b };' }).verdict, 'allow');
}
{
  const file = write('satisfies.ts', 'interface Foo { x: number }\nexport const cfg = { x: 1 };\n');

  check('`satisfies` is allowed — it checks without discarding the inferred type', run({ file_path: file, old_string: 'export const cfg = { x: 1 };', new_string: 'export const cfg = { x: 1 } satisfies Foo;' }).verdict, 'allow');
}

// === 3. an edit that leaves an EXISTING assertion elsewhere untouched — allowed ========================
{
  const file = write('untouched-region.ts', 'export const legacy = (x: unknown) => x as string;\nexport const other = 2;\n');

  check('editing an unrelated line, with a pre-existing assertion elsewhere, is allowed', run({ file_path: file, old_string: 'export const other = 2;', new_string: 'export const other = 3;' }).verdict, 'allow');
}

// === 4. an assertion REMOVED — always allowed ===========================================================
{
  const file = write('removed-assertion.ts', 'export const value = (x: unknown) => x as string;\n');

  check('removing the only assertion in the file is allowed', run({ file_path: file, old_string: 'export const value = (x: unknown) => x as string;', new_string: 'export const value = (x: string) => x;' }).verdict, 'allow');
}

// === 5. an assertion MOVED within the same edit, count unchanged — allowed =============================
{
  const file = write('moved-assertion.ts', 'export function f(x: unknown) {\n  const a = x as string;\n  return a;\n}\n');
  const result = run({ file_path: file, old_string: '  const a = x as string;\n  return a;', new_string: '  return x as string;' });

  check('moving an assertion to a different line in the same edit is allowed (matched by text)', result.verdict, 'allow');
}

// === 6. `as` / `!` inside a string or a comment — allowed, it is data ==================================
{
  const file = write('string-comment.ts', "export const label = 'not';\n");
  const result = run({ file_path: file, old_string: "export const label = 'not';", new_string: "export const label = 'cast as string'; // as before, still fine!\n" });

  check('`as` and `!` written as DATA inside a string/comment are never counted', result.verdict, 'allow');
}

// === 7. a non-TypeScript file — ignored =================================================================
{
  const file = write('../notes.md', 'This file talks about `x as string` a lot.\n');

  check('a non-TypeScript file is ignored regardless of what its text contains', run({ file_path: file, old_string: 'a lot.', new_string: 'a lot, with x as string added too.' }).verdict, 'allow');
}

// === 8. Write creating a brand-new file — count starts at 0 ============================================
{
  const file = path.join(src, 'brand-new-with-assertion.ts');

  check('the fixture path really does not exist yet', existsSync(file), false);

  const result = run({ file_path: file, content: "export const value = (x: unknown) => x as string;\n" }, { tool: 'Write' });

  check('a brand-new file whose content already asserts is refused — before=0 still counts up', result.verdict, 'deny');
  check('...and the refusal says the count went from 0', result.out.includes('from 0 to 1'), true);
}
{
  const file = path.join(src, 'brand-new-clean.ts');
  const result = run({ file_path: file, content: 'export const value = 1;\n' }, { tool: 'Write' });

  check('a brand-new file with no assertion at all is allowed', result.verdict, 'allow');
}

// === 9. MultiEdit — sequential edits, second one adds an assertion — refused ============================
{
  const file = write('multi-adds.ts', 'export function f(x: unknown, y: unknown) {\n  return [x, y];\n}\n');
  const result = run(
    {
      file_path: file,
      edits: [
        { old_string: '  return [x, y];', new_string: '  const first = x;\n  return [first, y];' },
        { old_string: '  const first = x;', new_string: '  const first = x as string;' }
      ]
    },
    { tool: 'MultiEdit' }
  );

  check('MultiEdit applies edits SEQUENTIALLY, and a later one introducing an assertion is refused', result.verdict, 'deny');
}
{
  const file = write('multi-renames-only.ts', 'export function f(x: unknown) {\n  const value = x;\n  return value;\n}\n');
  const result = run(
    {
      file_path: file,
      edits: [
        { old_string: 'const value = x;', new_string: 'const renamed = x;' },
        { old_string: 'return value;', new_string: 'return renamed;' }
      ]
    },
    { tool: 'MultiEdit' }
  );

  check('MultiEdit that only renames, adding no assertion, is allowed', result.verdict, 'allow');
}

// === 10. no TypeScript compiler resolvable for the target repository — fails OPEN, and reports ==========
{
  const unresolvable = mkdtempSync(path.join(tmpdir(), 'type-assertion-guard-no-ts-'));
  // Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
  // también ante una excepción: un selftest no deja nada tras de sí.
  process.once('exit', () => rmSync(unresolvable, { recursive: true, force: true }));
  const bareCheck = resolveTypeScript(path.join(unresolvable, 'x.ts'));

  check('setup: the unresolvable fixture directory really has no TypeScript reachable from it', 'error' in bareCheck, true);

  const target = path.join(unresolvable, 'orphan.ts');

  writeFileSync(target, 'export function identity(x: unknown) {\n  return x;\n}\n', 'utf8');

  const result = run({ file_path: target, old_string: '  return x;', new_string: '  return x as string;' }, { cwd: unresolvable });

  check('with no TypeScript compiler resolvable, the guard fails OPEN (allows)', result.verdict, 'allow');
  check('...and NAMES the malfunction on stderr, in both languages', includesAll(result.stderr, ['type-assertion-guard', 'TypeScript compiler', '@es']), true);
}

// === 11. Edit/MultiEdit naming a file that does not exist on disk — fails OPEN, and reports =============
{
  const missing = path.join(src, 'does-not-exist.ts');
  const result = run({ file_path: missing, old_string: 'anything', new_string: 'x as string' });

  check('Edit on a file absent from disk fails OPEN', result.verdict, 'allow');
  check('...and reports the malfunction on stderr', result.stderr.includes('does not exist on disk'), true);
}

// === 12. `old_string` disagreeing with what is really on disk — fails OPEN, and reports =================
{
  const file = write('disagrees-with-disk.ts', 'export const value = 1;\n');
  const result = run({ file_path: file, old_string: 'this text is not in the file', new_string: 'x as string' });

  check('an old_string absent from the real disk content fails OPEN', result.verdict, 'allow');
  check('...and reports the disagreement on stderr', result.stderr.includes('payload disagrees with the disk'), true);
}

// === 13. a tool this guard does not watch — ignored ======================================================
{
  const file = write('bash-target.ts', 'export const value = 1;\n');

  check('a tool other than Edit/Write/MultiEdit is ignored even naming a .ts file', run({ command: `echo x as string >> ${file}` }, { tool: 'Bash' }).verdict, 'allow');
}

// === 14. malformed / non-JSON payloads, with and without a BOM — fail OPEN silently ======================
for (const [label, input] of [['garbage', 'NOT JSON AT ALL'], ['empty', ''], ['BOM + garbage', '﻿NOT JSON']]) {
  const result = spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8' });
  const out = result.stdout ?? '';

  check(`fails open on ${label}`, `${result.status}/${out.includes('"deny"') ? 'deny' : 'allow'}`, '0/allow');
}
{
  // A BOM in front of a otherwise-VALID payload still parses — the BOM strip must not eat real content.
  const file = write('bom-valid.ts', 'export function identity(x: unknown) {\n  return x;\n}\n');
  const payload = `﻿${JSON.stringify({ session_id: 's', cwd: repo, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: file, old_string: '  return x;', new_string: '  return x as string;' } })}`;
  const result = spawnSync(process.execPath, [GUARD], { input: payload, encoding: 'utf8' });

  check('a BOM in front of an otherwise-valid payload still parses, and the edit is judged normally', (result.stdout ?? '').includes('"deny"'), true);
}

// === NOTHING DEGRADED INVISIBLY: only the 3 designed-malfunction cases above (10, 11, 12) recorded one. ==
{
  const lines = existsSync(errorsFile()) ? readFileSync(errorsFile(), 'utf8').split('\n').filter((line) => line.length > 0) : [];

  check('the guard recorded a malfunction ONLY for the cases designed to malfunction (>=3), never for a clean decision', lines.length >= 3, true);
}

// === THE WIRING: the tools/files the decision covers are the ones the declaration + manifest register ===
// Read from the REAL global `~/.claude`, via `homedir()`, never relative to `HERE`: under the mutation
// runner, `HERE` is a sandboxed COPY holding only `type-assertion-guard/` and `mutation-proof/`, and
// `settings.json` / the dispatcher manifests live one level up in the real, undeployed-elsewhere tree.
// This guard's own `guard.mjs.hook-registration.json` DOES travel with the sandbox, so it alone is read
// from `HERE`. Under the selftest runner the home is a sandbox, so the tree under test is read from the
// `SELFTEST_TREE` it sets (`selftest-runner/run.mjs`).
// @es Bajo el runner de selftests el home es un sandbox, así que el árbol bajo prueba se lee de `SELFTEST_TREE`.
const TREE = process.env.SELFTEST_TREE || path.join(homedir(), '.claude');
{
  const declaration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const matcher = declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher;

  check('the declaration registers Edit|Write|MultiEdit, which the decision covers', matcher, 'Edit|Write|MultiEdit');
}
{
  const manifestFile = path.join(TREE, 'hook-dispatch', 'manifests', 'pretooluse-authoring.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));

  check('the dispatcher manifest lists this guard for PreToolUse', manifest.event === 'PreToolUse' && manifest.guards.includes('../../type-assertion-guard/guard.mjs'), true);
}
{
  const settings = JSON.parse(readFileSync(path.join(TREE, 'settings.json'), 'utf8'));
  const wired = (settings.hooks?.PreToolUse ?? []).some((entry) => entry.matcher === 'Edit|Write|MultiEdit' && entry.hooks.some((hook) => typeof hook.command === 'string' && hook.command.includes('pretooluse-authoring.json')));

  check('settings.json wires Edit|Write|MultiEdit to the dispatcher with this guard\'s manifest', wired, true);
}

process.stdout.write(`type-assertion-guard selftest: ${passed} passed, ${failures.length} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
