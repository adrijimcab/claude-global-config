/**
 * Owns the question "is this CI quality-stage template safe to copy into a company repository?". A folder of
 * quality-stage files is complete and safe when (1) every file of the stage exists; (2) no file names the
 * private kit or a private home path (`gates-kit`, `~/.claude`): the copy lands in tracked company code;
 * (3) every comment block of a config file carries an `@es` Spanish line, and the README carries at least one;
 * (4) the CI file has the four jobs uncommented, no `allow_failure`, and a dependency audit at `high` or
 * stricter (or osv-scanner); (5) gitleaks uses the default rules, sets entropy 3.5 or more ON THE RULE (the
 * `[extend.entropy]` table is not a gitleaks key and does nothing), and every allowlist entry has a comment
 * line with its reason right above it; (6) Lighthouse runs at least 3 times, asserts on the median and holds
 * accessibility as an `error` of at least 0.9; (7) `.npmrc` points the scoped registry at `<REGISTRY_HOST>`
 * and every credential is a `${VAR}` reference; (8) the ESLint config spreads `configs.consumer`, loads
 * eslint-plugin-security and switches no rule `off`; the Stylelint config loads the shared plugin with
 * postcss-scss and sets no rule to `null` or `false`. Nothing here reads a project, it only reads text.
 *
 * Decisions: a rule that is registered but off is refused (adoption happens only at zero offenders); a
 * credential value is never echoed in a problem; a defect is reported alone.
 *
 * @es Responde a "¿es seguro copiar esta plantilla de la etapa de calidad de CI a un repositorio de la
 * empresa?". Está completa y es segura cuando (1) existe cada fichero de la etapa; (2) ninguno nombra el kit
 * privado ni una ruta privada del home (`gates-kit`, `~/.claude`): la copia cae en código versionado de la
 * empresa; (3) cada bloque de comentarios de un fichero de config lleva una línea `@es`, y el README al menos
 * una; (4) el CI tiene los cuatro jobs sin comentar, ningún `allow_failure` y una auditoría en `high` o más
 * estricta (u osv-scanner); (5) gitleaks usa las reglas por defecto, fija entropía 3.5 o más EN LA REGLA (la
 * tabla `[extend.entropy]` no es una clave de gitleaks y no hace nada) y cada entrada de la lista de
 * permitidos tiene encima una línea de comentario con su motivo; (6) Lighthouse corre al menos 3 veces,
 * afirma sobre la mediana y mantiene accesibilidad como `error` de al menos 0.9; (7) `.npmrc` apunta el
 * registro con scope a `<REGISTRY_HOST>` y toda credencial es una referencia `${VAR}`; (8) la config de ESLint
 * hace spread de `configs.consumer`, carga eslint-plugin-security y no apaga ninguna regla (`off`); la de
 * Stylelint carga el plugin compartido con postcss-scss y no pone ninguna regla en `null` ni `false`.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The files of the stage. @es Los ficheros de la etapa. */
export const STAGE_FILES = ['.gitlab-ci.yml', '.gitleaks.toml', '.lighthouserc.cjs', '.npmrc', '.stylelintrc.cjs', 'eslint.config.js', 'README.md'];

const PRIVATE_REFERENCE = /gates-kit|~\/\.claude/;
const JOBS = ['quality:styles', 'quality:secrets', 'quality:dependency-audit', 'quality:lighthouse'];
const AUDIT_COMMAND = /npm audit --audit-level=(?:low|moderate|high)\b|osv-scanner/;

/** The comment marker of a config file, by extension. @es El marcador de comentario de un fichero. */
const commentMarker = (name) => (name.endsWith('.cjs') || name.endsWith('.js') ? '//' : '#');

/** The lines of `text` that are not comments. @es Las líneas que no son comentarios. */
const codeLines = (name, text) => text.split('\n').filter((line) => !line.trimStart().startsWith(commentMarker(name)));

/** Names of the comment blocks without an `@es` line, as a count. @es Cuenta de bloques de comentarios sin línea `@es`. */
function blocksWithoutMirror(name, text) {
  const marker = commentMarker(name);
  const blocks = [[]];

  for (const line of text.split('\n').map((raw) => raw.trim())) {
    if (line.startsWith(marker)) blocks[blocks.length - 1].push(line);
    else if (blocks[blocks.length - 1].length > 0) blocks.push([]);
  }

  return blocks.filter((block) => block.length > 0 && !block.some((line) => line.startsWith(`${marker} @es `))).length;
}

/** Problems of the CI file. @es Problemas del fichero de CI. */
function ciProblems(code) {
  const problems = JOBS.filter((job) => !code.some((line) => line.trimEnd() === `${job}:`)).map((job) => ({ id: 'ci-missing-job', detail: job }));

  if (code.some((line) => line.includes('allow_failure'))) problems.push({ id: 'ci-allow-failure' });
  if (!code.some((line) => AUDIT_COMMAND.test(line))) problems.push({ id: 'ci-weak-audit' });
  if (!code.some((line) => line.includes('gitleaks detect'))) problems.push({ id: 'ci-missing-gitleaks' });

  return problems;
}

/** Problems of the gitleaks config. @es Problemas de la config de gitleaks. */
function gitleaksProblems(text, code) {
  const problems = [];
  const entropy = /^entropy\s*=\s*(\d+(?:\.\d+)?)\s*$/m.exec(code.join('\n'));
  const lines = text.split('\n');

  if (!code.some((line) => line.trim() === 'useDefault = true')) problems.push({ id: 'gitleaks-no-default-rules' });
  if (code.some((line) => line.trim() === '[extend.entropy]')) problems.push({ id: 'gitleaks-noop-entropy' });
  if (entropy === null || Number(entropy[1]) < 3.5) problems.push({ id: 'gitleaks-entropy' });

  lines.forEach((line, at) => {
    if (/^\s*'''.*'''\s*,?\s*$/.test(line) && !(at > 0 && lines[at - 1].trimStart().startsWith('#'))) problems.push({ id: 'gitleaks-allowlist-no-reason' });
  });

  return problems;
}

/** Problems of the Lighthouse config. @es Problemas de la config de Lighthouse. */
function lighthouseProblems(code) {
  const body = code.join('\n');
  const runs = /numberOfRuns:\s*(\d+)/.exec(body);
  const a11y = /'categories:accessibility':\s*\[\s*'error',\s*\{\s*minScore:\s*([\d.]+)/.exec(body);
  const problems = [];

  if (runs === null || Number(runs[1]) < 3) problems.push({ id: 'lighthouse-runs' });
  if (!/aggregationMethod:\s*'median'/.test(body)) problems.push({ id: 'lighthouse-not-median' });
  if (a11y === null || Number(a11y[1]) < 0.9) problems.push({ id: 'lighthouse-a11y' });

  return problems;
}

/** Problems of `.npmrc`; a credential value is never echoed. @es Problemas de `.npmrc`; nunca se repite un valor de credencial. */
function npmrcProblems(code) {
  const credentials = code.map((line) => /(?:_authToken|_auth|_password)\s*=\s*(.*)$/.exec(line)).filter((match) => match !== null);
  const problems = [];

  if (!code.some((line) => /^@[^:]+:registry=/.test(line) && line.includes('<REGISTRY_HOST>'))) problems.push({ id: 'npmrc-registry-not-placeholder' });
  if (credentials.length === 0) problems.push({ id: 'npmrc-missing-token-reference' });
  if (credentials.some((match) => !/^\$\{[A-Z0-9_]+\}$/.test(match[1].trim()))) problems.push({ id: 'npmrc-literal-credential' });

  return problems;
}

/** Problems of the two lint configs. @es Problemas de las dos configs de lint. */
function lintProblems(name, code) {
  const body = code.join('\n');

  if (name === 'eslint.config.js') {
    return [
      ...['configs.consumer', 'eslint-plugin-security'].filter((needle) => !body.includes(needle)).map((needle) => ({ id: 'eslint-missing', detail: needle })),
      ...(/['"]off['"]/.test(body) ? [{ id: 'eslint-off-rule' }] : []),
    ];
  }

  return [
    ...['@base100/stylelint-plugin', 'postcss-scss'].filter((needle) => !body.includes(needle)).map((needle) => ({ id: 'stylelint-missing', detail: needle })),
    ...(/:\s*(?:null|false)\b/.test(body) ? [{ id: 'stylelint-off-rule' }] : []),
  ];
}

/** Rules specific to one file. @es Reglas propias de cada fichero. */
function fileProblems(name, text) {
  const code = codeLines(name, text);

  if (name === '.gitlab-ci.yml') return ciProblems(code);
  if (name === '.gitleaks.toml') return gitleaksProblems(text, code);
  if (name === '.lighthouserc.cjs') return lighthouseProblems(code);
  if (name === '.npmrc') return npmrcProblems(code);
  if (name === 'eslint.config.js' || name === '.stylelintrc.cjs') return lintProblems(name, code);

  return [];
}

/**
 * Inspects the stage files, given as `{ name: text }`, and returns `[{ id, detail? }]`; empty when the stage
 * is complete and safe to copy. @es Inspecciona los ficheros de la etapa; vacío cuando está completa y es segura.
 */
export function inspectQualityStage(files) {
  const problems = [];

  for (const name of STAGE_FILES) {
    const text = files[name];

    if (text === undefined) {
      problems.push({ id: 'missing-file', detail: name });
      continue;
    }

    const lf = text.replaceAll('\r\n', '\n');

    if (PRIVATE_REFERENCE.test(lf)) problems.push({ id: 'private-reference', detail: name });
    if (name === 'README.md' ? !lf.split('\n').some((line) => line.startsWith('@es ')) : blocksWithoutMirror(name, lf) > 0) problems.push({ id: 'missing-es-mirror', detail: name });
    problems.push(...fileProblems(name, lf).map((problem) => ({ ...problem, detail: problem.detail ?? name })));
  }

  return problems;
}

/** Whether `folder` holds a quality stage. @es Si `folder` contiene una etapa de calidad. */
export const isQualityStage = (folder) => existsSync(path.join(folder, '.gitlab-ci.yml'));

/** Reads the stage files of `folder`. @es Lee los ficheros de la etapa de `folder`. */
export function inspectQualityFolder(folder) {
  const files = Object.fromEntries(STAGE_FILES.filter((name) => existsSync(path.join(folder, name))).map((name) => [name, readFileSync(path.join(folder, name), 'utf8')]));

  return inspectQualityStage(files);
}
