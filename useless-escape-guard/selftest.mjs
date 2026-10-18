#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for the useless-escape guard. Every case is a state the decision ranges over; the
 * guard must speak (refuse) where a backslash would be lost and stay silent everywhere else.
 *
 * In the cases below the character `§` stands for a backslash and is swapped before use, so this file's own
 * source holds no escape the guard could misjudge (and no escape a shell could eat).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de la guardia de escapes inútiles. Cada caso es un estado del espacio de la
 * decisión; la guardia debe hablar (rechazar) donde se perdería una barra invertida y callar en el resto.
 * En los casos, `§` representa una barra invertida y se cambia antes de usarse.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { evaluate, errorsFile } from './guard.mjs';
import { literalSegments } from './lexer.mjs';
import { findUselessEscapes } from './useless-escapes.mjs';

isolateState('useless-escape-guard');

const BS = String.fromCharCode(92);
const sourceOf = (text) => text.replaceAll('§', BS);
const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), 'useless-escape-guard-selftest-'));

process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let failures = 0;

function check(name, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${condition ? '' : ` ${detail}`}`);
}

const found = (text) => findUselessEscapes(sourceOf(text));
const writeCall = (file, content) => JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file, content: sourceOf(content) } });
const decisionOf = (raw) => evaluate(raw)?.hookSpecificOutput?.permissionDecision;

// --- the lexer + finder: what is judged
const incident = 'const re = `/insightObject§/[^/]+§/ids$/`';
const incidentFindings = found(`// header\n${incident}\n`);

check('S1 incident text is found at its line', incidentFindings.length === 2 && incidentFindings.every((entry) => entry.line === 2) && incidentFindings[0].escape === `${BS}/`, JSON.stringify(incidentFindings));
check('single-quoted string with a useless escape is found', found("const a = '§s';").length === 1 && found("const a = '§s';")[0].escape === `${BS}s`);
check('double-quoted string with a useless escape is found', found('const a = "§d";').length === 1);
check('a real regex literal is not judged', found('x = /a§/b§s/;').length === 0);
check('division is not a regex', found('const r = a / b / c; const s = "ok";').length === 0);
check('division after a parenthesis, then a regex', found('x = (1) / 2; y = /§d/').length === 0);
check('a regex after a keyword is a regex', found('function f() { return /§d"/; }').length === 0);
check('a regex whose class holds a slash does not end early', found("x = /[/]§s'/; y = 'ok';").length === 0);
check('a doubled backslash is valid', found("a = '§§s';").length === 0);
check('an escaped dollar and an escaped backtick are valid', found('a = `§${x}`; b = `§``;').length === 0);
check('every valid escape passes', found("a = '§n§r§t§b§f§v§0§1§x41§u0041§'§\"§§';").length === 0);
check('a line continuation passes', found("a = 'one§\ntwo';").length === 0);
check('a Windows line continuation passes and does not end the string', found("a = 'one§\r\ntwo'; b = '§s';").length === 1 && found("a = 'one§\r\ntwo'; b = '§s';")[0].line === 2);
check('two findings on one line are both found', found("a = '§s'; b = '§d';").length === 2);
check('a template is a value, so a slash after it is division', found("a = `x` / 2; y = '§s';").length === 1);
check('an object literal inside a template expression does not close it', found('a = `${ {a: 1}.a + `§.` }`;').length === 1);
check('a nested template is judged', found('a = `${ `§/` }`;').length === 1);
check('an escape after a nested template closes is still judged', found('a = `${ `ok` }§.`;').length === 1);
check('braces inside a template expression do not end it early', found('a = `${ { b: 1 }.b }§-`;').length === 1);
check('an escape inside a line comment passes', found('// see §/ here\nconst a = 1;').length === 0);
check('an escape inside a block comment passes', found('/* §/ */ const a = 1;').length === 0);
check('a quote inside a comment does not open a string', found("// it's\nconst a = '§s';").length === 1);
check('a quote inside a regex does not open a string', found('x = /\'/; y = "§s";').length === 1);
check('a tagged template (String.raw) is not judged', found('x = String.raw`§d+`;').length === 0);
check('an untagged template after an operator is judged', found('x = `§d+`;').length === 1);
check('a hashbang line does not disturb the lines after it', found('#!/usr/bin/env node\nconst a = 1;\nb = "§s";')[0]?.line === 3);
check('a slash after a number is division', found("x = 1 / 2; y = '§s';").length === 1);
check('a slash after a closing parenthesis is division', found("x = (1) / 2; y = '§s';").length === 1);
check('a slash after a closing bracket is division', found("x = [1] / 2; y = '§s';").length === 1);
check('a slash after a closing brace is division', found("x = {a: 1} / 2; y = '§s';").length === 1);
check('a slash after an identifier is division', found("x = a / 2; y = '§s';").length === 1);
check('a slash after return is a regex', found("function f() { return /'/; } y = '§s';").length === 1);
check('a slash after typeof or in is a regex', found("x = typeof /'/; y = '§s';").length === 1);
check('a slash after an operator is a regex', found("x = a + /'/; y = '§s';").length === 1);
check('a slash inside a class does not end the regex', found("x = /[/]'/; y = '§s';").length === 1);
check('an escaped slash does not end the regex', found("x = /a§/'/; y = '§s';").length === 1);
check('an escaped brace is valid', found("a = '§{';").length === 0);
check('an escaped line separator is valid', found("a = '§" + String.fromCharCode(0x2028) + "';").length === 0);
check('a block comment keeps the line count', found("/* one\ntwo */ a = '§s';")[0]?.line === 2);
check('a line continuation keeps the line count', found("a = 'x§\ny';\nb = '§s';")[0]?.line === 3);
check('a template keeps the line count after it closes', found('a = `x\ny`;\nb = "§s";')[0]?.line === 3);
check('a template expression keeps the line count', found('a = `x${\n1}`;\nb = "§s";')[0]?.line === 3);
check('only the block closing a template expression resumes the template', found('a = `${ f(() => { return 1; }) }§.`;').length === 1);
check('the line of a multi-line template finding counts newlines inside it', found('a = `one\ntwo §.\nthree`;')[0]?.line === 2);
check('an unterminated string does not hang or swallow later lines', found("a = 'open\nb = '§s';").length === 1);
check('lexer yields segments with their line', [...literalSegments("a = 1;\nb = 'x';")].map((segment) => segment.line).join() === '2');

// --- the guard: tool, file type, Write, Edit, malformed
const mjs = path.join(scratch, 'script.mjs');
const bad = 'const re = `/a§/b/`;\n';
const clean = 'const re = `/a//b/`;\n';

check('Write of an escaping .mjs is refused', decisionOf(writeCall(mjs, bad)) === 'deny');
check('Write of a clean .mjs passes', decisionOf(writeCall(mjs, clean)) === undefined);
check('Write of an escaping .js is refused', decisionOf(writeCall(path.join(scratch, 'a.js'), bad)) === 'deny');
check('Write of an escaping .cjs is refused', decisionOf(writeCall(path.join(scratch, 'a.cjs'), bad)) === 'deny');
check('a .ts file is not judged', decisionOf(writeCall(path.join(scratch, 'a.ts'), bad)) === undefined);
check('a tool the guard does not watch is not judged', decisionOf(JSON.stringify({ tool_name: 'Bash', tool_input: { file_path: mjs, content: sourceOf(bad) } })) === undefined);

const refusal = evaluate(writeCall(mjs, `ok\n\n${bad}`))?.hookSpecificOutput?.permissionDecisionReason ?? '';

check('the refusal names file, line and escape', refusal.includes(mjs) && refusal.includes('line 3') && refusal.includes(`${BS}/`), refusal);
check('the refusal is bilingual and gives the fix', refusal.includes('@es') && /double the backslash/i.test(refusal) && /duplicar la barra/i.test(refusal));

writeFileSync(mjs, clean);

const editCall = (oldString, newString) => JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: mjs, old_string: sourceOf(oldString), new_string: sourceOf(newString) } });

check('an Edit that introduces the escape is refused', decisionOf(editCall('a//b', 'a§/b')) === 'deny');

writeFileSync(mjs, sourceOf(bad));

check('an Edit that removes the escape passes', decisionOf(editCall('a§/b', 'a//b')) === undefined);
check('an Edit that leaves the escape in place is refused (the file after the edit is what is judged)', decisionOf(editCall('const re', 'let re')) === 'deny');

// --- fail open
check('a malformed payload passes', decisionOf('{ not json') === undefined);
check('a payload with a BOM still parses', decisionOf(String.fromCharCode(0xfeff) + writeCall(mjs, bad)) === 'deny');
check('a payload with no file_path passes', decisionOf(JSON.stringify({ tool_name: 'Write', tool_input: {} })) === undefined);

const beforeLines = existsSync(errorsFile()) ? readFileSync(errorsFile(), 'utf8').split('\n').filter(Boolean).length : 0;
const spawned = spawnSync(process.execPath, [path.join(here, 'guard.mjs')], { input: editCall('this text is not in the file', 'x'), encoding: 'utf8', env: process.env });
const afterLines = existsSync(errorsFile()) ? readFileSync(errorsFile(), 'utf8').split('\n').filter(Boolean).length : 0;

check('an edit the guard cannot simulate fails open, silently on stdout', spawned.status === 0 && spawned.stdout === '', `status=${spawned.status} stdout=${spawned.stdout}`);
check('that malfunction is named on stderr in both languages and journaled', spawned.stderr.includes('failing OPEN') && spawned.stderr.includes('@es') && afterLines === beforeLines + 1, spawned.stderr);

const cli = spawnSync(process.execPath, [path.join(here, 'guard.mjs')], { input: writeCall(mjs, bad), encoding: 'utf8', env: process.env });

check('run as a hook, a refusal is JSON on stdout with exit 0', cli.status === 0 && cli.stdout.includes('"permissionDecision":"deny"'), cli.stdout);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
