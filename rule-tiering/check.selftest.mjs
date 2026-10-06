#!/usr/bin/env node
/**
 * Proof of `check.mjs` and the inputs it reads: the "before" comes from git at the named revision, never from
 * the working copy; anchors come from the repository's `customizations.mjs`, only for the file checked; only
 * `.md` files are evidence; CRLF is read as LF; every unreadable input (bad revision, path absent at it, missing
 * "after", missing, empty or unlisted evidence directory, a customizations module that cannot be imported,
 * missing argument) is exit 2 and never a verdict; a repository with NO customizations module has no overlay
 * anchors and is judged on everything else, as a project repository is; a conserved file is exit 0 and a
 * deficit exit 1, named in a bilingual report. Every repository is CONSTRUCTED here, under `scratch/`, and
 * removed.
 *
 * @es Prueba de `check.mjs` y de lo que lee: el "antes" sale de git en la revisión nombrada, nunca de la copia
 * de trabajo; las anclas salen del `customizations.mjs` del repositorio, solo para el fichero comprobado; solo
 * los `.md` son evidencia; CRLF se lee como LF; toda entrada ilegible (incluido un módulo de customizations
 * que no se puede importar) es salida 2 y nunca un veredicto; un repositorio SIN módulo de customizations no
 * tiene anclas de overlay y se juzga por todo lo demás, como un repositorio de proyecto; un fichero conservado
 * sale 0 y un déficit 1, nombrado en un informe bilingüe. Cada repositorio se CONSTRUYE aquí, bajo
 * `scratch/`, y se borra.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = path.join(HERE, 'check.mjs');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, '-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', ...args], { encoding: 'utf8' });

  if (result.status !== 0) throw new Error(`fixture git ${args.join(' ')} failed: ${result.stderr}`);

  return result.stdout.trim();
}

const NARRATIVE = '  Narrative that moves to evidence.';
const BEFORE = ['# R', '', '- **`k`** — Keep this. RULE: archive before cutting.', NARRATIVE, '- **`other`** — Another file anchor.'].join('\n');
const CONSERVED = ['# R', '- **`k`** — Keep this. RULE: archive before cutting.'].join('\n');
const CUSTOMIZATIONS = `export const CUSTOMIZATIONS = [
  { id: 'r', kind: 'owner-sections-outside-managed-regions', file: '.claude/rules/r.md', anchors: ['# R', '- **\`k\`**'] },
  { id: 'r-without-anchors', kind: 'persona-region-matches-upstream', file: '.claude/rules/r.md' },
  { id: 'other', kind: 'owner-sections-outside-managed-regions', file: '.claude/rules/other.md', anchors: ['- **\`other\`**'] }
];
`;

const sandbox = path.join(HERE, 'scratch');

mkdirSync(sandbox, { recursive: true });

const root = mkdtempSync(path.join(sandbox, 'check-'));

try {
  const repo = path.join(root, 'repo');
  const evidence = path.join(root, 'evidence');
  const after = path.join(root, 'after.md');

  mkdirSync(path.join(repo, 'rules'), { recursive: true });
  mkdirSync(path.join(repo, 'gentle-ai-overlay'), { recursive: true });
  mkdirSync(evidence);
  writeFileSync(path.join(repo, 'rules', 'r.md'), BEFORE);
  writeFileSync(path.join(repo, 'gentle-ai-overlay', 'customizations.mjs'), CUSTOMIZATIONS);
  git(repo, 'init', '-q');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'first');
  const first = git(repo, 'rev-parse', 'HEAD');

  writeFileSync(path.join(repo, 'rules', 'r.md'), `${BEFORE}\nA line only the second commit holds.`);
  git(repo, 'commit', '-q', '-am', 'second');
  writeFileSync(path.join(repo, 'rules', 'r.md'), 'A working copy that no revision holds.');
  writeFileSync(path.join(evidence, 'k.md'), `# evidence\n${NARRATIVE}\n- **\`other\`** — Another file anchor.\n`);
  writeFileSync(after, CONSERVED);

  const run = (overrides = {}) => {
    const options = { repo, rev: first, file: 'rules/r.md', after, evidence, ...overrides };
    const argv = Object.entries(options).filter(([, value]) => value !== undefined).flatMap(([name, value]) => [`--${name}`, value]);
    const result = spawnSync(process.execPath, [CHECK, ...argv], { encoding: 'utf8' });

    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  };

  const conserved = run();

  check('a conserved file at the first revision exits 0, whatever the working copy holds', conserved.status, 0);
  check('the conserved report is bilingual', conserved.output.includes('conserved') && conserved.output.includes('@es'), true);

  const second = run({ rev: 'HEAD' });

  check('the revision decides: at HEAD the second commit line is removed and unarchived', second.status, 1);
  check('the deficit report names the line and its kind', second.output.includes('[unarchived]') && second.output.includes('A line only the second commit holds.'), true);

  writeFileSync(after, CONSERVED.split('\n').join('\r\n'));
  check('a CRLF after is read as LF', run().status, 0);

  writeFileSync(after, ['# R', '  - **`k`** — Keep this. RULE: archive before cutting.'].join('\n'));
  const indented = run();

  check('an anchor declared for this file is enforced', indented.status, 1);
  check('exactly one anchor deficit: the one declared for this file, never the other file\'s', indented.output.split('[anchor-lost]').length - 1, 1);
  writeFileSync(after, CONSERVED);

  writeFileSync(path.join(evidence, 'k.md'), '# nothing archived\n');
  writeFileSync(path.join(evidence, 'k.txt'), `${NARRATIVE}\n- **\`other\`** — Another file anchor.\n`);
  check('a .txt file in the evidence directory is not evidence', run().status, 1);
  rmSync(path.join(evidence, 'k.txt'));
  writeFileSync(path.join(evidence, 'k.md'), `${NARRATIVE}\n- **\`other\`** — Another file anchor.\n`);

  // A section moved to a file of the repository says where it went; the pointer is admitted only for a file of the evidence set.
  // @es Una sección movida a un fichero del repositorio dice adónde fue; el puntero se admite solo para un fichero del conjunto de evidencia.
  const moved = path.join(repo, 'moved');

  mkdirSync(moved);
  writeFileSync(path.join(moved, 'k.md'), `${NARRATIVE}\n- **\`other\`** — Another file anchor.\n`);
  writeFileSync(after, `${CONSERVED}\nEvidence: moved/k.md`);
  check('a pointer to the repository path of a file of the evidence directory is conserved', run({ evidence: moved }).status, 0);
  check('...the same pointer when the evidence directory is outside the repository is invented', run().status, 1);
  writeFileSync(after, `${CONSERVED}\nEvidence: ../evidence/k.md`);
  check('...a path that climbs out of the repository to an evidence directory is invented too', run().status, 1);
  writeFileSync(after, `${CONSERVED}\nEvidence: moved/other.md`);
  check('...a pointer to a file the evidence directory does not hold is invented', run({ evidence: moved }).status, 1);
  writeFileSync(after, CONSERVED);

  const plain = path.join(root, 'plain');

  mkdirSync(path.join(plain, 'rules'), { recursive: true });
  writeFileSync(path.join(plain, 'rules', 'r.md'), BEFORE);
  git(plain, 'init', '-q');
  git(plain, 'add', '-A');
  git(plain, 'commit', '-q', '-m', 'plain');

  // A project repository has no overlay: no module means no overlay anchors, and everything else is still judged.
  // @es Un repositorio de proyecto no tiene overlay: sin módulo no hay anclas de overlay y todo lo demás se sigue juzgando.
  const bare = run({ repo: plain, rev: 'HEAD' });

  check('a repository without the customizations module is measured: conserved exits 0', bare.status, 0);
  const kept = path.join(root, 'kept');

  mkdirSync(kept);
  writeFileSync(path.join(kept, 'k.md'), `${NARRATIVE}\n- **\`other\`** — Another file anchor.\n- **\`k\`** — Keep this. RULE: archive before cutting.\n`);
  writeFileSync(after, ['# R', '  - **`k`** — Keep this. RULE: archive before cutting.'].join('\n'));
  check('...and it enforces no anchor: an indented line fails with the module and passes without it', [run({ evidence: kept }).status, run({ repo: plain, rev: 'HEAD', evidence: kept }).status], [1, 0]);
  writeFileSync(after, CONSERVED);

  const nothing = path.join(root, 'nothing');

  mkdirSync(nothing);
  writeFileSync(path.join(nothing, 'k.md'), '# nothing archived\n');
  check('...and every other decision is still taken there: an unarchived removed line is a deficit', run({ repo: plain, rev: 'HEAD', evidence: nothing }).status, 1);

  const broken = path.join(root, 'broken');

  mkdirSync(path.join(broken, 'rules'), { recursive: true });
  mkdirSync(path.join(broken, 'gentle-ai-overlay'), { recursive: true });
  writeFileSync(path.join(broken, 'rules', 'r.md'), BEFORE);
  writeFileSync(path.join(broken, 'gentle-ai-overlay', 'customizations.mjs'), 'export const CUSTOMIZATIONS = [ {');
  git(broken, 'init', '-q');
  git(broken, 'add', '-A');
  git(broken, 'commit', '-q', '-m', 'broken');

  const unmeasured = [
    ['a customizations module that cannot be imported', { repo: broken, rev: 'HEAD' }],
    ['a revision git does not know', { rev: 'no-such-revision' }],
    ['a path absent at the revision', { file: 'rules/absent.md' }],
    ['a missing after file', { after: path.join(root, 'absent.md') }],
    ['a missing evidence directory', { evidence: path.join(root, 'absent') }],
    ['an evidence directory with no .md file', { evidence: path.join(repo, 'gentle-ai-overlay') }],
    ['a missing argument', { rev: undefined }]
  ];

  for (const [name, overrides] of unmeasured) {
    const result = run(overrides);

    check(`${name} is not measured (exit 2)`, result.status, 2);
    check(`${name} is reported bilingually`, result.output.includes('NOT MEASURED') && result.output.includes('@es'), true);
  }

  check('a missing argument is named', run({ rev: undefined }).output.includes('missing --rev'), true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`rule-tiering check selftest: ${passed} passed, ${failures.length} failed\n`);
for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
