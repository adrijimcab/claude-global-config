#!/usr/bin/env node
/** Mutant campaign of the kit's diff-coverage. @es Campaña de mutantes de diff-coverage del kit. */

import { runCampaign } from '../testing/campaign.mjs';

const C = 'diff-coverage/classify.mjs';
const S = 'diff-coverage/karma/karma-summary.mjs';
const K = 'diff-coverage/karma/karma-config.mjs';
const R = 'diff-coverage/karma/karma-run.mjs';
const D = 'diff-coverage/diff-coverage.mjs';

runCampaign('diff-coverage/selftest.mjs', [
  ['a file outside the source root is graded', C, '  if (!file.startsWith(project.sourceRoot)) return false;\n', ''],
  ['an excluded suffix is graded', C, '  if (project.excludeSuffixes.some((suffix) => file.endsWith(suffix))) return false;\n', ''],
  ['an excluded segment is graded', C, 'return !project.excludeSegments.some(', 'return true || !project.excludeSegments.some('],
  ['the first progress line is read instead of the last', S, 'lines.findLast(', 'lines.find('],
  ['zero specs are trusted', S, 'if (summary.total === 0) return', 'if (false) return'],
  ['a skipped or focused run is trusted', S, 'if (summary.executed !== summary.total) return', 'if (false) return'],
  ['FAILED, ERROR and DISCONNECTED are ignored', S, 'const failure = FAILURE_WORDS.find(', 'const failure = [].find('],
  ['a non-zero exit is trusted', S, 'if (exitCode !== 0) return', 'if (false) return'],
  ['a run without lcov is trusted', S, 'if (!coverageFileExists) return', 'if (false) return'],
  ['the base thresholds survive into the graded run', K, 'config.coverageReporter = { dir:', 'config.coverageReporter = { ...config.coverageReporter, dir:'],
  ['basePath is always the workspace', K, '(baseConfig === BUILTIN ? workspaceDir : path.dirname(path.join(workspaceDir, baseConfig)))', '(workspaceDir)'],
  ['another Angular major uses the mirror', K, 'if (major !== MIRRORED_ANGULAR_MAJOR) return', 'if (false) return'],
  ['a missing ng CLI is runnable', R, 'if (!existsSync(ngCliOf(workspaceDir))) return', 'if (false) return'],
  ['a dirty tree is graded', D, 'if (plan.dirty.length > 0) return cannotGrade(', 'if (false) return cannotGrade('],
  ['a blocked project is run anyway', D, 'if (blocked.length > 0) return', 'if (false) return'],
  ['absolute SF paths are not mapped', D, '(path.isAbsolute(raw) ? path.relative(top, raw).split(path.sep).join(\'/\') : path.posix.join(workspace, raw))', '(path.posix.join(workspace, raw))'],
  ['an untrusted run is graded', D, 'if (!trusted.ok) return', 'if (false) return'],
  ['the plan runs the suite', D, 'if (planOnly) return { exitCode: EXIT.PLAN', 'if (false) return { exitCode: EXIT.PLAN'],
  ['uncovered lines read as covered', D, 'if (uncovered.length > 0) return { exitCode: EXIT.UNCOVERED', 'if (false) return { exitCode: EXIT.UNCOVERED']
]);
