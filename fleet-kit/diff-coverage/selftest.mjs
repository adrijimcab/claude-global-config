#!/usr/bin/env node
/**
 * Selftest of the kit's diff-coverage: classification, Karma run trust, the generated Karma config (loaded
 * and executed against a fake Karma), the toolchain and mirror preconditions, and the whole decision on
 * constructed repositories with an injected runner that returns literal Karma output and literal lcov.
 * @es Selftest de diff-coverage del kit: clasificación, confianza en la corrida de Karma, la config
 * generada (cargada y ejecutada contra un Karma falso), precondiciones, y la decisión completa sobre
 * repositorios construidos con un runner inyectado que devuelve salida y lcov literales.
 */

import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { baseConfig, cleanup, commitFiles, git, makeRepository, suite, tempDir, writeConfig, writeFile } from '../testing/fixtures.mjs';
import { isGradedBy } from './classify.mjs';
import { EXIT, runDiffCoverage } from './diff-coverage.mjs';
import { builtinMirrorProblem, karmaConfigSource } from './karma/karma-config.mjs';
import { karmaRunProblem } from './karma/karma-run.mjs';
import { decideKarmaRun, parseKarmaSummary } from './karma/karma-summary.mjs';

const { check, finish } = suite();
const project = { name: 'app', sourceRoot: 'web/src/', extensions: ['.ts'], excludeSuffixes: ['.spec.ts'], excludeSegments: ['/testing/'], karma: { workspace: 'web', ngProject: 'app', baseConfig: 'angular-builtin' } };
const SUCCESS = 'Chrome Headless 120 (Windows 10): Executed 12 of 12 SUCCESS (1.2 secs / 1 secs)';

// --- classification ------------------------------------------------------------------------------
check('a source file under the root is graded', isGradedBy(project, 'web/src/app/a.ts'), true);
check('a file under a sibling folder is not graded', isGradedBy(project, 'web/src2/a.ts'), false);
check('another extension is not graded', isGradedBy(project, 'web/src/app/a.html'), false);
check('an excluded suffix is not graded', isGradedBy(project, 'web/src/app/a.spec.ts'), false);
check('an excluded segment is not graded', isGradedBy(project, 'web/src/testing/a.ts'), false);

// --- Karma run trust -----------------------------------------------------------------------------
const trust = (text, exitCode = 0, coverageFileExists = true) => decideKarmaRun({ text, exitCode, coverageFileExists });

check('the last rewritten progress line is the summary', parseKarmaSummary(`Executed 3 of 12\rExecuted 12 of 12 SUCCESS (1 sec)`), { executed: 12, total: 12, status: 'SUCCESS (1 sec)' });
check('a complete successful run is trusted', trust(SUCCESS), { ok: true });
check('no summary is not trusted', trust('Error: cannot find module').ok, false);
check('zero specs is not trusted', trust('Executed 0 of 0 SUCCESS').reason, 'Karma found zero specs');
check('a skipped or focused spec makes the run incomplete', trust('Executed 10 of 12 (skipped 2) SUCCESS').ok, false);
check('a failed spec is not trusted', trust('Executed 12 of 12 (1 FAILED) (1 sec)').reason.startsWith('the run ended FAILED'), true);
check('an error is not trusted', trust('Executed 12 of 12 ERROR (1 sec)').reason.startsWith('the run ended ERROR'), true);
check('a disconnect is not trusted', trust('Executed 12 of 12 DISCONNECTED (1 sec)').reason.startsWith('the run ended DISCONNECTED'), true);
check('a summary without SUCCESS is not trusted', trust('Executed 12 of 12 (1 sec)').reason.startsWith('the run did not report SUCCESS'), true);
check('a non-zero exit after SUCCESS is not trusted', trust(SUCCESS, 1).ok, false);
check('a run without lcov is not trusted', trust(SUCCESS, 0, false).reason, 'no lcov.info was produced');

const root = tempDir('diff-coverage');

try {
  // --- the generated Karma config, executed ------------------------------------------------------
  const workspaceDir = path.join(root, 'workspace');

  writeFile(workspaceDir, 'lib/karma.conf.cjs', "module.exports = (config) => config.set({ basePath: '', frameworks: ['jasmine'], coverageReporter: { dir: 'coverage/x', check: { global: { lines: 90 } } }, reporters: ['kjhtml'] });\n");
  const wrapperFile = writeFile(root, 'run/karma.graded.cjs', karmaConfigSource({ workspaceDir, baseConfig: 'lib/karma.conf.cjs', coverageDir: path.join(root, 'run', 'coverage') }));
  const fakeKarma = { set(values) { Object.assign(this, values); } };

  createRequire(import.meta.url)(wrapperFile)(fakeKarma);
  check('the wrapper keeps the base config', fakeKarma.frameworks, ['jasmine']);
  check('the wrapper sends lcov to the run directory and drops thresholds', fakeKarma.coverageReporter, { dir: path.join(root, 'run', 'coverage'), subdir: '.', reporters: [{ type: 'lcovonly' }, { type: 'text-summary' }] });
  check('the wrapper restores the base config folder as basePath', fakeKarma.basePath, path.join(workspaceDir, 'lib'));
  check('the wrapper reports with progress', fakeKarma.reporters, ['progress']);
  check('the built-in base is mirrored, not required from a file', karmaConfigSource({ workspaceDir, baseConfig: 'angular-builtin', coverageDir: 'c' }).includes("frameworks: ['jasmine', '@angular-devkit/build-angular']"), true);

  // --- preconditions ------------------------------------------------------------------------------
  check('no devkit installed: the mirror cannot be used', builtinMirrorProblem(workspaceDir).startsWith('@angular-devkit/build-angular is not installed'), true);
  writeFile(workspaceDir, 'node_modules/@angular-devkit/build-angular/package.json', JSON.stringify({ version: '20.0.1' }));
  check('another Angular major: the mirror refuses', builtinMirrorProblem(workspaceDir).includes('re-derive the mirror'), true);
  writeFile(workspaceDir, 'node_modules/@angular-devkit/build-angular/package.json', JSON.stringify({ version: '19.2.22' }));
  check('the mirrored major: usable', builtinMirrorProblem(workspaceDir), undefined);
  check('no ng CLI: toolchain missing', karmaRunProblem(workspaceDir, project.karma).startsWith('toolchain missing'), true);
  writeFile(workspaceDir, 'node_modules/@angular/cli/bin/ng.js', '');
  check('ng CLI and the mirrored major present: runnable', karmaRunProblem(workspaceDir, project.karma), undefined);
  check('a missing base config file is named', karmaRunProblem(workspaceDir, { ...project.karma, baseConfig: 'nope.cjs' }).includes('nope.cjs'), true);

  // --- the whole decision on a constructed repository ----------------------------------------------
  const repository = makeRepository(root);
  const stateRoot = path.join(root, 'state');
  const grade = (options = {}) => runDiffCoverage({ worktree: repository, stateRoot, ...options });

  check('no config: cannot grade', grade().exitCode, EXIT.CANNOT_GRADE);
  writeConfig(repository, baseConfig({ coverage: { enabled: false, reason: 'no test runner exists in this repository' }, handback: { coverage: 'off', reason: 'no test runner exists in this repository' } }));
  check('coverage disabled: cannot grade, with the reason', grade().message.includes('no test runner exists'), true);

  writeConfig(repository, baseConfig({ coverage: { runner: 'karma', projects: [project] } }));
  commitFiles(repository, { '.gitignore': 'node_modules/\n' }, 'chore: ignore');
  writeFile(repository, 'web/node_modules/@angular/cli/bin/ng.js', '');
  writeFile(repository, 'web/node_modules/@angular-devkit/build-angular/package.json', JSON.stringify({ version: '19.2.22' }));
  git(repository, 'checkout', '--quiet', '-b', 'feature');

  check('a missing base branch: cannot grade', grade({ base: 'nope' }).exitCode, EXIT.CANNOT_GRADE);
  commitFiles(repository, { 'docs/a.md': 'x\n' });
  check('only ungraded files changed: nothing to grade', grade().exitCode, EXIT.COVERED);

  commitFiles(repository, { 'web/src/app/a.ts': 'const a = 1;\nconst b = a ? 2 : 3;\nexport { b };\n', 'web/src/app/a.spec.ts': 'spec\n' });

  let lcov = '';
  let karmaText = SUCCESS;
  const runProject = ({ runDir, name }) => {
    const lcovPath = writeFile(runDir, `${name}/coverage/lcov.info`, lcov);

    return { text: karmaText, exitCode: 0, lcovPath, coverageFileExists: true };
  };
  const record = (lines, branches = '') => `TN:\nSF:src\\app\\a.ts\n${lines}${branches}end_of_record\n`;

  lcov = record('DA:1,1\nDA:2,1\nDA:3,1\nDA:9,0\n', 'BRDA:2,0,0,1\nBRDA:2,0,1,1\n');
  const fullyCovered = { exitCode: EXIT.COVERED, message: 'diff-coverage: every changed line and branch is covered.' };

  check('every changed line and branch covered; debt outside the diff ignored', grade({ runProject }), fullyCovered);
  lcov = record('DA:1,1\nDA:2,0\nDA:3,1\n');
  check('an uncovered changed line is named', grade({ runProject }).message.split('\n')[0], 'web/src/app/a.ts:2 (line)');
  lcov = record('DA:1,1\nDA:2,1\nDA:3,1\n', 'BRDA:2,0,0,1\nBRDA:2,0,1,0\n');
  check('an uncovered branch on a covered line is named', grade({ runProject }).message.split('\n')[0], 'web/src/app/a.ts:2 (branch)');
  lcov = `TN:\nSF:${path.join(repository, 'web', 'src', 'app', 'a.ts')}\nDA:1,1\nDA:2,1\nDA:3,1\nend_of_record\n`;
  check('an absolute SF path maps to the repo-relative file (graded, not skipped)', grade({ runProject }), fullyCovered);
  lcov = 'TN:\nSF:src/app/other.ts\nDA:1,1\nend_of_record\n';
  check('a changed file never instrumented is skipped, not failed', [grade({ runProject }).exitCode, grade({ runProject }).message.includes('skipped')], [EXIT.COVERED, true]);
  karmaText = 'Executed 10 of 12 (skipped 2) SUCCESS';
  check('an incomplete run cannot grade', grade({ runProject }).exitCode, EXIT.CANNOT_GRADE);

  const plan = grade({ plan: true });

  check('the plan is not a verdict', plan.exitCode, EXIT.PLAN);
  check('the plan counts the gradable file and its lines', plan.message.includes('project app: 1 gradable file(s), 3 changed line(s)'), true);
  check('the plan names the command it would run', plan.message.includes('--karma-config='), true);
  check('the plan reports a clean tree', plan.message.includes('tree       : clean'), true);

  karmaText = SUCCESS;
  lcov = record('DA:1,1\nDA:2,1\nDA:3,1\n');
  writeFileSync(path.join(repository, 'web', 'src', 'app', 'a.ts'), 'changed\n');
  check('a dirty tree: the plan says so', grade({ plan: true }).message.includes('DIRTY — 1 porcelain entries'), true);
  check('a dirty tree: the run refuses, naming the tree', grade({ runProject }).message.includes('porcelain entries; coverage of the working tree'), true);
  git(repository, 'checkout', '--quiet', '--', '.');

  karmaText = SUCCESS;
  lcov = record('DA:1,1\nDA:2,1\nDA:3,1\n');
  rmSync(path.join(repository, 'web', 'node_modules', '@angular', 'cli'), { recursive: true });
  check('a missing toolchain cannot grade', grade({ runProject }).message.includes('toolchain missing'), true);
} finally {
  cleanup(root);
}

finish('diff-coverage');
