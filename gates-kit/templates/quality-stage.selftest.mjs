#!/usr/bin/env node
/**
 * Proof that the CI quality-stage checker DISCRIMINATES, and that the live stage passes it. Fixtures are
 * literal text built here, never the checker's constants. State space: a correct stage; each file missing; a
 * private reference (kit name or private home path) in every file; a comment block without its `@es` line in
 * each config kind and a README without any; the CI file with a job commented out or absent, `allow_failure`
 * in code (and in a comment, which is allowed), a weak, absent or osv audit; gitleaks without default rules,
 * with the no-op entropy table, with low, absent or high entropy, and an allowlist entry with and without its
 * reason; Lighthouse with few runs, an `optimistic` aggregation, a weak or warning accessibility budget;
 * `.npmrc` with a literal, `_auth` or `_password` credential, a real host, no credential or a good reference;
 * ESLint without the preset or the security plugin or with a rule `off`; Stylelint without the plugin or the
 * SCSS syntax, or with a rule `null` or `false`; CRLF text; folder discovery.
 *
 * @es Prueba de que el verificador de la etapa de calidad de CI DISCRIMINA y de que la etapa real lo pasa.
 * Los fixtures son texto literal construido aquí. Espacio de estados: etapa correcta; cada fichero ausente;
 * referencia privada en cada fichero; bloque de comentarios sin `@es` en cada tipo de config y README sin
 * ninguno; CI con un job comentado o ausente, `allow_failure` en código (y en comentario, permitido),
 * auditoría débil, ausente u osv; gitleaks sin reglas por defecto, con la tabla de entropía sin efecto, con
 * entropía baja, ausente o alta, y una entrada de lista de permitidos con y sin motivo; Lighthouse con pocas
 * corridas, agregación `optimistic`, presupuesto de accesibilidad débil o como aviso; `.npmrc` con
 * credencial literal, `_auth` o `_password`, un host real, sin credencial o con una referencia correcta;
 * ESLint sin el preset o el plugin de seguridad o con una regla `off`; Stylelint sin el plugin o la sintaxis
 * SCSS, o con una regla `null` o `false`; texto CRLF; descubrimiento de carpetas.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectDirectory } from './template-rules.mjs';
import { inspectQualityFolder, inspectQualityStage } from './quality-stage-rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CI = ['# Quality jobs.', '# @es Jobs de calidad.', 'quality:styles:', '  script: [a]', 'quality:secrets:', '  script:', '    - gitleaks detect --source .', 'quality:dependency-audit:', '  script:', '    - npm audit --audit-level=high', 'quality:lighthouse:', '  script: [b]', ''];
const TOML = ['# Rules.', '# @es Reglas.', '[extend]', 'useDefault = true', '', '[[rules]]', 'id = "generic-api-key"', 'entropy = 3.5', '', '[allowlist]', 'paths = [', '  # Reason: fixture.', '  # @es Motivo: fixture.', "  '''\\.env\\.example'''", ']', ''];
const LIGHTHOUSE = ['// Budgets.', '// @es Presupuestos.', 'module.exports = { ci: {', '  collect: { numberOfRuns: 3 },', "  assert: { aggregationMethod: 'median', assertions: {", "    'categories:accessibility': ['error', { minScore: 0.9 }],", '  } },', '} };', ''];
const NPMRC = ['# Registry.', '# @es Registro.', '@scope:registry=https://<REGISTRY_HOST>/path/', '//<REGISTRY_HOST>/:_authToken=${REGISTRY_TOKEN}', ''];
const ESLINT = ['// Lint.', '// @es Lint.', "import security from 'eslint-plugin-security';", 'export default [...b100.configs.consumer, { rules: { x: "error" } }];', ''];
const STYLELINT = ['// Styles.', '// @es Estilos.', "module.exports = { plugins: ['@base100/stylelint-plugin'], customSyntax: 'postcss-scss', rules: { a: true } };", ''];
const README = ['# Stage', '@es Etapa', ''];

/** The correct stage as `{ name: text }`, then `edit` applied to a copy. @es La etapa correcta, y `edit` sobre una copia. */
function stage(edit = () => {}) {
  const files = { '.gitlab-ci.yml': CI.join('\n'), '.gitleaks.toml': TOML.join('\n'), '.lighthouserc.cjs': LIGHTHOUSE.join('\n'), '.npmrc': NPMRC.join('\n'), '.stylelintrc.cjs': STYLELINT.join('\n'), 'eslint.config.js': ESLINT.join('\n'), 'README.md': README.join('\n') };

  edit(files);

  return files;
}

/** Edits one file of the stage with a text replacement; the target must exist. @es Edita un fichero con un reemplazo. */
const swap = (name, from, to) => (files) => {
  if (!files[name].includes(from)) throw new Error(`fixture does not hold ${from}`);
  files[name] = files[name].replace(from, to);
};

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** Problem ids as `id:detail`. @es Problemas como `id:detalle`. */
function problemsOf(files) {
  try {
    return inspectQualityStage(files).map((problem) => `${problem.id}:${problem.detail}`).join();
  } catch (error) {
    return `threw:${error.message}`;
  }
}

check('a correct stage has no problem', problemsOf(stage()) === '');
check('CRLF line endings are read the same', problemsOf(Object.fromEntries(Object.entries(stage()).map(([name, text]) => [name, text.replaceAll('\n', '\r\n')]))) === '');

for (const name of Object.keys(stage())) {
  check(`${name} missing is the only problem`, problemsOf(stage((files) => delete files[name])) === `missing-file:${name}`);
  check(`${name} naming the private kit is refused`, problemsOf(stage((files) => { files[name] += '\nsee gates-kit\n'; })).split(',').includes(`private-reference:${name}`));
  check(`${name} naming a private home path is refused`, problemsOf(stage((files) => { files[name] += '\nsee ~/.claude/x\n'; })).split(',').includes(`private-reference:${name}`));
}

check('a CI comment block without @es is reported', problemsOf(stage(swap('.gitlab-ci.yml', '# @es Jobs de calidad.', '# Jobs de calidad.'))) === 'missing-es-mirror:.gitlab-ci.yml');
check('a TOML comment block without @es is reported', problemsOf(stage(swap('.gitleaks.toml', '  # @es Motivo: fixture.\n', ''))) === 'missing-es-mirror:.gitleaks.toml');
check('a script comment block without @es is reported', problemsOf(stage(swap('.lighthouserc.cjs', '// @es Presupuestos.', '// Presupuestos.'))) === 'missing-es-mirror:.lighthouserc.cjs');
check('an @es line in another block does not cover a block', problemsOf(stage(swap('.npmrc', '@scope:registry', '\n# Second block without a mirror.\n@scope:registry'))) === 'missing-es-mirror:.npmrc');
check('an @es marker without a space is no mirror', problemsOf(stage(swap('.npmrc', '# @es Registro.', '# @esRegistro.'))) === 'missing-es-mirror:.npmrc');
check('a README without any @es line is reported', problemsOf(stage(swap('README.md', '@es Etapa', 'Etapa'))) === 'missing-es-mirror:README.md');

check('a commented-out job is missing', problemsOf(stage(swap('.gitlab-ci.yml', 'quality:lighthouse:', '# quality:lighthouse:\n# @es x'))) === 'ci-missing-job:quality:lighthouse');
for (const job of ['quality:styles', 'quality:secrets', 'quality:dependency-audit']) check(`the ${job} job absent is the only problem`, problemsOf(stage(swap('.gitlab-ci.yml', `${job}:`, `${job}-x:`))) === `ci-missing-job:${job}`);
check('allow_failure in code is refused', problemsOf(stage(swap('.gitlab-ci.yml', 'quality:lighthouse:', 'quality:lighthouse:\n  allow_failure: true'))) === 'ci-allow-failure:.gitlab-ci.yml');
check('allow_failure in a comment is allowed', problemsOf(stage(swap('.gitlab-ci.yml', '# Quality jobs.', '# No allow_failure here.'))) === '');
check('a critical-only audit is weak', problemsOf(stage(swap('.gitlab-ci.yml', '--audit-level=high', '--audit-level=critical'))) === 'ci-weak-audit:.gitlab-ci.yml');
check('a missing audit is weak', problemsOf(stage(swap('.gitlab-ci.yml', 'npm audit --audit-level=high', 'echo skip'))) === 'ci-weak-audit:.gitlab-ci.yml');
check('a moderate audit is stricter and accepted', problemsOf(stage(swap('.gitlab-ci.yml', '--audit-level=high', '--audit-level=moderate'))) === '');
check('osv-scanner is an accepted audit', problemsOf(stage(swap('.gitlab-ci.yml', 'npm audit --audit-level=high', 'osv-scanner --lockfile=package-lock.json'))) === '');
check('an audit that exists only in a comment is no audit', problemsOf(stage(swap('.gitlab-ci.yml', '    - npm audit --audit-level=high', '    # - npm audit --audit-level=high\n    # @es x'))) === 'ci-weak-audit:.gitlab-ci.yml');
check('a missing gitleaks command is reported', problemsOf(stage(swap('.gitlab-ci.yml', 'gitleaks detect', 'echo'))) === 'ci-missing-gitleaks:.gitlab-ci.yml');

check('gitleaks without the default rules is reported', problemsOf(stage(swap('.gitleaks.toml', 'useDefault = true', 'useDefault = false'))) === 'gitleaks-no-default-rules:.gitleaks.toml');
check('the no-op entropy table is refused', problemsOf(stage(swap('.gitleaks.toml', '[extend]', '[extend.entropy]\nMin = 3.5\n[extend]'))) === 'gitleaks-noop-entropy:.gitleaks.toml');
check('entropy below 3.5 is refused', problemsOf(stage(swap('.gitleaks.toml', 'entropy = 3.5', 'entropy = 3.0'))) === 'gitleaks-entropy:.gitleaks.toml');
check('entropy of exactly 3.5 is accepted', problemsOf(stage()) === '');
check('entropy above 3.5 is accepted', problemsOf(stage(swap('.gitleaks.toml', 'entropy = 3.5', 'entropy = 4'))) === '');
check('entropy only in a comment is no entropy', problemsOf(stage(swap('.gitleaks.toml', 'entropy = 3.5', '# entropy = 3.5\n# @es x'))) === 'gitleaks-entropy:.gitleaks.toml');
check('an allowlist entry without a reason is refused', problemsOf(stage(swap('.gitleaks.toml', "  '''\\.env\\.example'''", "  '''\\.env\\.example''',\n  '''other'''"))) === 'gitleaks-allowlist-no-reason:.gitleaks.toml');
check('an allowlist entry with a trailing comma and no reason is refused', problemsOf(stage(swap('.gitleaks.toml', "  '''\\.env\\.example'''", "  '''\\.env\\.example''',\n  '''other''',"))) === 'gitleaks-allowlist-no-reason:.gitleaks.toml');
check('an allowlist entry on the first line is refused without a crash', problemsOf(stage((files) => { files['.gitleaks.toml'] = `'''x'''\n${files['.gitleaks.toml']}`; })) === 'gitleaks-allowlist-no-reason:.gitleaks.toml');
check('an allowlist entry with its reason is accepted', problemsOf(stage(swap('.gitleaks.toml', "  '''\\.env\\.example'''", "  '''\\.env\\.example''',\n  # Reason: r.\n  # @es Motivo: m.\n  '''other'''"))) === '');

check('fewer than 3 Lighthouse runs is refused', problemsOf(stage(swap('.lighthouserc.cjs', 'numberOfRuns: 3', 'numberOfRuns: 1'))) === 'lighthouse-runs:.lighthouserc.cjs');
check('more than 3 Lighthouse runs is accepted', problemsOf(stage(swap('.lighthouserc.cjs', 'numberOfRuns: 3', 'numberOfRuns: 5'))) === '');
check('a missing run count is refused', problemsOf(stage(swap('.lighthouserc.cjs', 'collect: { numberOfRuns: 3 },', ''))) === 'lighthouse-runs:.lighthouserc.cjs');
check('an optimistic aggregation is refused', problemsOf(stage(swap('.lighthouserc.cjs', "'median'", "'optimistic'"))) === 'lighthouse-not-median:.lighthouserc.cjs');
check('an accessibility score below 0.9 is refused', problemsOf(stage(swap('.lighthouserc.cjs', 'minScore: 0.9', 'minScore: 0.8'))) === 'lighthouse-a11y:.lighthouserc.cjs');
check('an accessibility score above 0.9 is accepted', problemsOf(stage(swap('.lighthouserc.cjs', 'minScore: 0.9', 'minScore: 0.95'))) === '');
check('accessibility as a warning is refused', problemsOf(stage(swap('.lighthouserc.cjs', "['error',", "['warn',"))) === 'lighthouse-a11y:.lighthouserc.cjs');

check('a literal token is refused and never echoed', problemsOf(stage(swap('.npmrc', '${REGISTRY_TOKEN}', 'abc123secret'))) === 'npmrc-literal-credential:.npmrc');
check('a literal _auth is refused', problemsOf(stage(swap('.npmrc', '_authToken=${REGISTRY_TOKEN}', '_authToken=${REGISTRY_TOKEN}\n//<REGISTRY_HOST>/:_auth=Zm9v'))) === 'npmrc-literal-credential:.npmrc');
check('a literal _password is refused', problemsOf(stage(swap('.npmrc', '_authToken=${REGISTRY_TOKEN}', '_authToken=${REGISTRY_TOKEN}\n//<REGISTRY_HOST>/:_password=Zm9v'))) === 'npmrc-literal-credential:.npmrc');
check('a lowercase variable reference is refused', problemsOf(stage(swap('.npmrc', '${REGISTRY_TOKEN}', '${token}'))) === 'npmrc-literal-credential:.npmrc');
check('a reference followed by text is refused', problemsOf(stage(swap('.npmrc', '${REGISTRY_TOKEN}', '${REGISTRY_TOKEN}x'))) === 'npmrc-literal-credential:.npmrc');
check('a registry line with text before the scope is no registry line', problemsOf(stage(swap('.npmrc', '@scope:registry=https://<REGISTRY_HOST>/path/', 'x@scope:registry=https://<REGISTRY_HOST>/path/'))) === 'npmrc-registry-not-placeholder:.npmrc');
check('a README line starting with @estimated is no mirror', problemsOf(stage(swap('README.md', '@es Etapa', '@estimated cost'))) === 'missing-es-mirror:README.md');
check('a gitleaks command other than detect is refused', problemsOf(stage(swap('.gitlab-ci.yml', 'gitleaks detect --source .', 'gitleaks version'))) === 'ci-missing-gitleaks:.gitlab-ci.yml');
check('a half reference is refused', problemsOf(stage(swap('.npmrc', '${REGISTRY_TOKEN}', 'x${REGISTRY_TOKEN}'))) === 'npmrc-literal-credential:.npmrc');
check('a missing credential reference is reported', problemsOf(stage(swap('.npmrc', '//<REGISTRY_HOST>/:_authToken=${REGISTRY_TOKEN}', ''))) === 'npmrc-missing-token-reference:.npmrc');
check('a real registry host is refused', problemsOf(stage(swap('.npmrc', 'https://<REGISTRY_HOST>/path/', 'https://registry.example.test/path/'))) === 'npmrc-registry-not-placeholder:.npmrc');
check('a placeholder in another line is no registry', problemsOf(stage(swap('.npmrc', '@scope:registry=https://<REGISTRY_HOST>/path/', '@scope:registry=https://real.example.test/\n# <REGISTRY_HOST>\n# @es x'))) === 'npmrc-registry-not-placeholder:.npmrc');

check('ESLint without the consumer preset is reported', problemsOf(stage(swap('eslint.config.js', 'configs.consumer', 'configs.recommended'))) === 'eslint-missing:configs.consumer');
check('ESLint without the security plugin is reported', problemsOf(stage(swap('eslint.config.js', 'eslint-plugin-security', 'other-plugin'))) === 'eslint-missing:eslint-plugin-security');
check('an ESLint rule switched off is refused (double quotes)', problemsOf(stage(swap('eslint.config.js', 'x: "error"', 'x: "off"'))) === 'eslint-off-rule:eslint.config.js');
check('an ESLint rule switched off is refused (single quotes)', problemsOf(stage(swap('eslint.config.js', 'x: "error"', "x: 'off'"))) === 'eslint-off-rule:eslint.config.js');
check('the word off inside a comment is allowed', problemsOf(stage(swap('eslint.config.js', '// Lint.', '// "off" is refused.'))) === '');
check('Stylelint without the shared plugin is reported', problemsOf(stage(swap('.stylelintrc.cjs', '@base100/stylelint-plugin', 'other'))) === 'stylelint-missing:@base100/stylelint-plugin');
check('Stylelint without the SCSS syntax is reported', problemsOf(stage(swap('.stylelintrc.cjs', 'postcss-scss', 'postcss'))) === 'stylelint-missing:postcss-scss');
check('a Stylelint rule set to null is refused', problemsOf(stage(swap('.stylelintrc.cjs', 'a: true', 'a: null'))) === 'stylelint-off-rule:.stylelintrc.cjs');
check('a Stylelint rule set to false is refused', problemsOf(stage(swap('.stylelintrc.cjs', 'a: true', 'a: false'))) === 'stylelint-off-rule:.stylelintrc.cjs');

const roots = [];
process.once('exit', () => roots.forEach((root) => rmSync(root, { recursive: true, force: true }))); // @es toda raíz se elimina en toda salida

/** A fresh temporary root. @es Una raíz temporal. */
const freshRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'quality-stage-selftest-'));

  roots.push(root);

  return root;
};

const root = freshRoot();

mkdirSync(path.join(root, 'ci'));
for (const [name, text] of Object.entries(stage())) writeFileSync(path.join(root, 'ci', name), text);
mkdirSync(path.join(root, 'broken'));
for (const [name, text] of Object.entries(stage())) if (name !== 'README.md') writeFileSync(path.join(root, 'broken', name), text);
mkdirSync(path.join(root, 'plain'));
writeFileSync(path.join(root, 'plain', 'README.md'), 'not a stage\n');

/** Inspects a root; a throw yields one entry named `threw`. @es Inspecciona una raíz; un throw da una entrada `threw`. */
function inspectSafely(folder) {
  try {
    return inspectDirectory(folder);
  } catch (error) {
    return [{ name: 'threw', problems: [{ id: 'threw', detail: error.message }] }];
  }
}

const found = Object.fromEntries(inspectSafely(root).map((entry) => [entry.name, entry.problems.map((problem) => `${problem.id}:${problem.detail ?? ''}`).join()]));

check('a folder holding .gitlab-ci.yml is judged as a stage', found.ci === '');
check('a stage folder missing a file reports it', found.broken === 'missing-file:README.md');
check('a folder without .gitlab-ci.yml is still judged as a contract template', found.plain === 'missing-file:');
check('inspectQualityFolder reads the same files', (() => {
  try {
    return inspectQualityFolder(path.join(root, 'broken')).map((problem) => problem.id).join() === 'missing-file';
  } catch {
    return false;
  }
})());

const liveStage = inspectQualityFolder(path.join(HERE, 'gitlab-ci-quality'));

check(`the live gitlab-ci-quality stage has no problem (${liveStage.map((problem) => `${problem.id}:${problem.detail}`).join(',')})`, liveStage.length === 0);
check('discovery of the live folder reports the stage', inspectSafely(HERE).some((entry) => entry.name === 'gitlab-ci-quality' && entry.problems.length === 0));

if (failures.length > 0) {
  console.error(`quality-stage selftest FAILED @es el selftest de la etapa de calidad FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`quality-stage selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
