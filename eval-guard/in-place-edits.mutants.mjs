#!/usr/bin/env node
/**
 * The decisions of the in-place source edit rule (in-place-edits.mjs and its hook in detect.mjs), each broken once,
 * that `in-place-edits.selftest.mjs` must catch. A survivor is a missing assertion, never a mutant to soften.
 * @es Las decisiones de la regla de edición en el sitio de fuentes, rotas una a una, que su selftest debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const I = 'eval-guard/in-place-edits.mjs';
const D = 'eval-guard/detect.mjs';
const G = 'eval-guard/guard.mjs';

const MUTANTS = [
  ['ts is not a source extension', I, "new Set(['ts', 'tsx',", "new Set(['tsx',"],
  ['json is not a source extension', I, "'html', 'scss', 'css', 'json',", "'html', 'scss', 'css',"],
  ['the extension is compared in its case', I, 'name.slice(dot + 1).toLowerCase()', 'name.slice(dot + 1)'],
  ['a dotfile counts as having an extension', I, 'return dot > 0 && CODE_EXTENSIONS', 'return dot >= 0 && CODE_EXTENSIONS'],
  ['a backslash path is not split', I, "const name = word.split(/[\\\\/]/).pop() ?? '';", "const name = word.split('/').pop() ?? '';"],
  ['sed -i is not in place', I, "|| /^-[nErsuz]*i/.test(arg)", ''],
  ['sed --in-place is not in place', I, "arg === '--in-place' || arg.startsWith('--in-place=') || ", ''],
  ['any sed option is in place', I, '/^-[nErsuz]*i/.test(arg)', "arg.startsWith('-')"],
  ['perl -pi is not in place', I, "const perlInPlace = (args) => args.some((arg) => /^-[0-9pnlaw]*i/.test(arg));", 'const perlInPlace = () => false;'],
  ['perl -Ilib is read as in place', I, '/^-[0-9pnlaw]*i/', '/^-[a-zA-Z0-9]*i/'],
  ['awk -i inplace is not in place', I, "(arg === '-i' && args[index + 1] === 'inplace') || ", ''],
  ['sd is not an editor', I, "else if (program === 'sd') target = firstSource();\n", ''],
  ['Set-Content is not a writer', I, "new Set(['set-content', 'add-content', 'out-file'])", "new Set(['add-content', 'out-file'])"],
  ['Out-File is not a writer', I, "'add-content', 'out-file'])", "'add-content'])"],
  ['-LiteralPath is not read', I, "new Set(['-path', '-literalpath',", "new Set(['-path',"],
  ['a PowerShell positional target is not read', I, "  return args.find((arg) => !arg.startsWith('-'));", '  return undefined;'],
  ['a non-source target is refused too', I, 'target = named !== undefined && isSourceFile(named) ? named : undefined;', 'target = named;'],
  ['the .exe suffix is kept', I, ".toLowerCase().replace(/\\.exe$/, '')", '.toLowerCase()'],
  ['the rule is not consulted', D, '      if (inPlace !== undefined) {', '      if (false) {'],
  ['the parent session is covered too', D, "    if (delegated) {\n      const scriptRefusal", "    if (true) {\n      const scriptRefusal"],
  ['the refusal has no reason of its own', G, "  if (refusal.kind === 'in-place-edit') return inPlaceEditReason(refusal);\n", ''],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['eval-guard', 'hook-caller', 'hook-state', 'shell-command', 'bilingual-output'],
  selftest: 'eval-guard/in-place-edits.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
