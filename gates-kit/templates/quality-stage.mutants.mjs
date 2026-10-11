#!/usr/bin/env node
/**
 * The decisions of the CI quality-stage checker, each broken once, that `quality-stage.selftest.mjs` must
 * catch. The runner and its rules (green baseline, exactly-once target, parse check) live in
 * `../../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors (`crashKills: 'fail'`). Each row
 * names the decision it removes, not the line it edits. Known equivalent, not mutated: the `else if` that
 * skips opening an empty comment block (empty blocks are filtered out afterwards either way).
 *
 * @es Las decisiones del verificador de la etapa de calidad de CI, rotas una a una, que
 * `quality-stage.selftest.mjs` debe cazar. Una muerte solo por crash cuenta como superviviente. Equivalente
 * conocido, sin mutante: el `else if` que evita abrir un bloque de comentarios vacío (los bloques vacíos se
 * filtran después igual).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../../mutation-proof/run-mutants.mjs';

const R = 'gates-kit/templates/quality-stage-rules.mjs';
const T = 'gates-kit/templates/template-rules.mjs';
const FILES = ['.gitlab-ci.yml', '.gitleaks.toml', '.lighthouserc.cjs', '.npmrc', '.stylelintrc.cjs', 'eslint.config.js', 'README.md'];
const LIST = `[${FILES.map((name) => `'${name}'`).join(', ')}]`;
const r = String.raw;

const MUTANTS = [
  ...FILES.map((name) => [`${name} is dropped from the stage files`, R, LIST, `[${FILES.filter((other) => other !== name).map((other) => `'${other}'`).join(', ')}]`]),
  ['a missing file is not reported', R, "if (text === undefined) {", 'if (false) {'],
  ['a missing file reports under another id', R, "{ id: 'missing-file', detail: name }", "{ id: 'no-file', detail: name }"],
  ['a missing file does not stop its other checks', R, '      continue;\n', ''],
  ['the kit name is no private reference', R, r`/gates-kit|~\/\.claude/`, r`/gates-kitx|~\/\.claude/`],
  ['the private home path is no private reference', R, r`/gates-kit|~\/\.claude/`, r`/gates-kit|~\/\.claudex/`],
  ['the private reference check is skipped', R, 'if (PRIVATE_REFERENCE.test(lf)) problems.push', 'if (false) problems.push'],
  ['the private reference is reported under another id', R, "{ id: 'private-reference', detail: name }", "{ id: 'private', detail: name }"],
  ['CRLF text is not normalized', R, "text.replaceAll('\\r\\n', '\\n')", 'text'],
  ['script files use the shell comment marker', R, "? '//' : '#'", "? '#' : '//'"],
  ['only .cjs files are script files', R, "name.endsWith('.cjs') || name.endsWith('.js')", "name.endsWith('.cjs')"],
  ['only .js files are script files', R, "name.endsWith('.cjs') || name.endsWith('.js')", "name.endsWith('.js')"],
  ['an indented comment counts as code', R, '!line.trimStart().startsWith(commentMarker(name))', '!line.startsWith(commentMarker(name))'],
  ['comment lines are not trimmed into blocks', R, '.map((raw) => raw.trim())', '.map((raw) => raw)'],
  ['an empty block counts as a block without a mirror', R, 'block.length > 0 && !block.some', '!block.some'],
  ['the @es marker needs no trailing space', R, '`${marker} @es `', '`${marker} @es`'],
  ['a block without a mirror is not counted', R, 'blocksWithoutMirror(name, lf) > 0', 'blocksWithoutMirror(name, lf) > 1'],
  ['the README is read as a config file', R, "name === 'README.md' ?", "name === 'README.mdx' ?"],
  ['the README needs no @es line', R, ".some((line) => line.startsWith('@es '))", '.some(() => true)'],
  ['the README @es marker needs no space', R, "line.startsWith('@es ')", "line.startsWith('@es')"],
  ['the mirror problem is reported under another id', R, "{ id: 'missing-es-mirror', detail: name }", "{ id: 'no-mirror', detail: name }"],
  ['a problem detail is replaced by the file name', R, 'problem.detail ?? name', 'name'],
  ['the CI rules are not applied', R, "if (name === '.gitlab-ci.yml') return ciProblems(code);", ''],
  ['the gitleaks rules are not applied', R, "if (name === '.gitleaks.toml') return gitleaksProblems(text, code);", ''],
  ['the Lighthouse rules are not applied', R, "if (name === '.lighthouserc.cjs') return lighthouseProblems(code);", ''],
  ['the npmrc rules are not applied', R, "if (name === '.npmrc') return npmrcProblems(code);", ''],
  ['the ESLint rules are not applied', R, "name === 'eslint.config.js' || name === '.stylelintrc.cjs'", "name === '.stylelintrc.cjs'"],
  ['the Stylelint rules are not applied', R, "name === 'eslint.config.js' || name === '.stylelintrc.cjs'", "name === 'eslint.config.js'"],
  ['a job is found anywhere in a line', R, '`${job}:`)', '`${job}`)'],
  ['a job is found by prefix', R, 'line.trimEnd() === `${job}:`', 'line.startsWith(job)'],
  ['the job check is skipped', R, "const problems = JOBS.filter((job) => !code.some((line) => line.trimEnd() === `${job}:`)).map((job) => ({ id: 'ci-missing-job', detail: job }));", 'const problems = [];'],
  ['a missing job reports under another id', R, "id: 'ci-missing-job'", "id: 'ci-job'"],
  ['the quality:styles job is not required', R, "const JOBS = ['quality:styles', ", 'const JOBS = ['],
  ['the quality:secrets job is not required', R, "'quality:secrets', ", ''],
  ['the quality:dependency-audit job is not required', R, "'quality:dependency-audit', ", ''],
  ['the quality:lighthouse job is not required', R, ", 'quality:lighthouse']", ']'],
  ['allow_failure is not refused', R, "line.includes('allow_failure')", "line.includes('allow_failurex')"],
  ['allow_failure reports under another id', R, "{ id: 'ci-allow-failure' }", "{ id: 'ci-allow' }"],
  ['a critical-only audit passes', R, '(?:low|moderate|high)', '(?:low|moderate|high|critical)'],
  ['a high audit does not pass', R, '(?:low|moderate|high)', '(?:low|moderate)'],
  ['a moderate audit does not pass', R, '(?:low|moderate|high)', '(?:low|high)'],
  ['osv-scanner is no audit', R, '|osv-scanner/', '|osv-scannerx/'],
  ['the audit check is skipped', R, "if (!code.some((line) => AUDIT_COMMAND.test(line))) problems.push({ id: 'ci-weak-audit' });", ''],
  ['a missing gitleaks command passes', R, "line.includes('gitleaks detect')", "line.includes('gitleaks')"],
  ['the gitleaks command check is skipped', R, "if (!code.some((line) => line.includes('gitleaks detect'))) problems.push({ id: 'ci-missing-gitleaks' });", ''],
  ['the default rules are not required', R, "line.trim() === 'useDefault = true'", "line.trim() === 'useDefault = false'"],
  ['the default rules check is skipped', R, "if (!code.some((line) => line.trim() === 'useDefault = true')) problems.push({ id: 'gitleaks-no-default-rules' });", ''],
  ['the no-op entropy table is accepted', R, "line.trim() === '[extend.entropy]'", "line.trim() === '[extend.entropyx]'"],
  ['entropy below 3.5 is accepted', R, 'Number(entropy[1]) < 3.5', 'Number(entropy[1]) < 3.0'],
  ['entropy of exactly 3.5 is refused', R, 'Number(entropy[1]) < 3.5', 'Number(entropy[1]) <= 3.5'],
  ['a missing entropy is accepted', R, 'entropy === null || Number(entropy[1]) < 3.5', 'entropy !== null && Number(entropy[1]) < 3.5'],
  ['a decimal entropy is not read', R, r`(\d+(?:\.\d+)?)`, r`(\d+)`],
  ['an allowlist entry needs no reason', R, "&& !(at > 0 && lines[at - 1].trimStart().startsWith('#'))", '&& false'],
  ['the reason line is not trimmed', R, "lines[at - 1].trimStart().startsWith('#')", "lines[at - 1].startsWith('#')"],
  ['the first line is read as having a reason line', R, 'at > 0 && lines[at - 1]', 'at >= 0 && lines[at - 1]'],
  ['an entry with a trailing comma is not an entry', R, r`'''\s*,?\s*$/.test(line)`, r`'''\s*$/.test(line)`],
  ['an indented entry is not an entry', R, r`/^\s*'''.*'''`, r`/^'''.*'''`],
  ['fewer than 3 Lighthouse runs pass', R, 'Number(runs[1]) < 3', 'Number(runs[1]) < 1'],
  ['exactly 3 Lighthouse runs are refused', R, 'Number(runs[1]) < 3', 'Number(runs[1]) <= 3'],
  ['a missing run count passes', R, 'runs === null || Number(runs[1]) < 3', 'runs !== null && Number(runs[1]) < 3'],
  ['the optimistic aggregation passes', R, r`/aggregationMethod:\s*'median'/`, r`/aggregationMethod:\s*'[a-z]+'/`],
  ['the median check is skipped', R, "if (!/aggregationMethod:\\s*'median'/.test(body)) problems.push({ id: 'lighthouse-not-median' });", ''],
  ['an accessibility score below 0.9 passes', R, 'Number(a11y[1]) < 0.9', 'Number(a11y[1]) < 0.5'],
  ['an accessibility score of exactly 0.9 is refused', R, 'Number(a11y[1]) < 0.9', 'Number(a11y[1]) <= 0.9'],
  ['accessibility as a warning passes', R, r`\[\s*'error',`, r`\[\s*'[a-z]+',`],
  ['a missing accessibility budget passes', R, 'a11y === null || Number(a11y[1]) < 0.9', 'a11y !== null && Number(a11y[1]) < 0.9'],
  ['a real registry host passes', R, "&& line.includes('<REGISTRY_HOST>')", '&& true'],
  ['a registry line is found anywhere', R, r`/^@[^:]+:registry=/`, r`/@[^:]+:registry=/`],
  ['a missing credential reference passes', R, 'credentials.length === 0', 'false'],
  ['a literal token passes', R, "credentials.some((match) => !/^\\$\\{[A-Z0-9_]+\\}$/.test(match[1].trim()))", 'false'],
  ['a half reference passes', R, r`/^\$\{[A-Z0-9_]+\}$/`, r`/\$\{[A-Z0-9_]+\}$/`],
  ['a reference followed by text passes', R, r`/^\$\{[A-Z0-9_]+\}$/`, r`/^\$\{[A-Z0-9_]+\}/`],
  ['a lowercase reference passes', R, r`[A-Z0-9_]+\}$/`, r`[A-Za-z0-9_]+\}$/`],
  ['_auth is no credential', R, '(?:_authToken|_auth|_password)', '(?:_authToken|_password)'],
  ['_password is no credential', R, '(?:_authToken|_auth|_password)', '(?:_authToken|_auth)'],
  ['_authToken is no credential', R, '(?:_authToken|_auth|_password)', '(?:_auth|_password)'],
  ['the consumer preset is not required', R, "['configs.consumer', 'eslint-plugin-security']", "['eslint-plugin-security']"],
  ['the security plugin is not required', R, "['configs.consumer', 'eslint-plugin-security']", "['configs.consumer']"],
  ['a missing ESLint part reports under another id', R, "id: 'eslint-missing'", "id: 'eslint'"],
  ['a rule off in double quotes passes', R, r`/['"]off['"]/`, r`/'off'/`],
  ['a rule off in single quotes passes', R, r`/['"]off['"]/`, r`/"off"/`],
  ['the ESLint off check is skipped', R, "...(/['\"]off['\"]/.test(body) ? [{ id: 'eslint-off-rule' }] : []),", ''],
  ['the shared Stylelint plugin is not required', R, "['@base100/stylelint-plugin', 'postcss-scss']", "['postcss-scss']"],
  ['the SCSS syntax is not required', R, "['@base100/stylelint-plugin', 'postcss-scss']", "['@base100/stylelint-plugin']"],
  ['a Stylelint rule null passes', R, '(?:null|false)', '(?:false)'],
  ['a Stylelint rule false passes', R, '(?:null|false)', '(?:null)'],
  ['the Stylelint off check is skipped', R, "...(/:\\s*(?:null|false)\\b/.test(body) ? [{ id: 'stylelint-off-rule' }] : []),", ''],
  ['a folder is a stage by another file', R, "path.join(folder, '.gitlab-ci.yml')", "path.join(folder, '.gitlab-ci.ymlx')"],
  ['a missing file makes the folder read throw', R, 'STAGE_FILES.filter((name) => existsSync(path.join(folder, name))).map', 'STAGE_FILES.map'],
  ['the stage folder is not read by its files', R, "readFileSync(path.join(folder, name), 'utf8')", "''"],
  ['discovery never judges a stage', T, 'if (isQualityStage(path.join(root, name)))', 'if (false)'],
  ['discovery judges every folder as a stage', T, 'if (isQualityStage(path.join(root, name)))', 'if (true)'],
  ['discovery judges a stage as a contract', T, 'return { name, problems: inspectQualityFolder(path.join(root, name)) };', 'return { name, problems: [] };'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof', 'bilingual-output'], selftest: 'gates-kit/templates/quality-stage.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
