#!/usr/bin/env node
/**
 * The SCOPE of mutation testing: it is demanded in the modules that DECIDE, and this check says which those
 * are, which of them no campaign mutates, and which campaigns mutate a module that does not decide.
 *
 *   node scope.mjs [--root <repository>]      exit 0 no gap, 1 a gap, 2 not measured
 *
 * A deciding module (`deciding-modules.mjs` defines it) is COVERED when some campaign puts a mutant in it. Not
 * when a campaign merely copies it: the `paths` of a campaign are the folders its selftest needs, and half of
 * them copy `mutation-proof` whole. A deciding module with no campaign is a GAP and fails the check. A campaign
 * over a module that does not decide is reported as OPTIONAL information only: it still passes, removing it
 * would remove proof for no measured benefit, and whether to keep it is the owner's call.
 *
 * WHAT IT DOES NOT SAY. That a campaign is green (running them is `mutants-all`), or that a module has ENOUGH
 * mutants: it demands that the decision is attacked at all, the depth of the attack stays the campaign's.
 * A campaign that cannot be planned, a manifest that cannot be read and a declaration of a module that is gone
 * are PROBLEMS: they would turn into silence, so the verdict is "not measured", never green.
 *
 * Copied byte for byte between `b100-am-ui/.claude/mutation-proof/` (the owner) and `~/.claude/mutation-proof/`.
 *
 * @es El ALCANCE de la prueba de mutación: se exige en los módulos que DECIDEN, y este chequeo dice cuáles son,
 * cuáles no muta ninguna campaña y qué campañas mutan un módulo que no decide. CUBIERTO es que alguna campaña
 * ponga un mutante en el módulo, no que lo copie. Sin campaña es un HUECO y falla. Una campaña sobre un módulo que
 * no decide es información OPCIONAL: sigue pasando y conservarla es decisión del dueño. No dice que una campaña
 * esté en verde ni que haya mutantes SUFICIENTES. Una campaña no planificable, un manifiesto ilegible o una
 * declaración de un módulo que ya no está son PROBLEMAS: el veredicto es "no medido", nunca verde.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isCampaignFile, planCampaign } from './campaign-plan.mjs';
import { decidingModules } from './deciding-modules.mjs';

const EXIT_GAP = 1;
const EXIT_NOT_MEASURED = 2;

/**
 * Every file of the repository as git sees it: tracked and untracked-but-not-ignored, minus what is gone from
 * disk. The same population the selftest runner measures, so a fixture or a scratch copy is never scanned.
 * @returns {string[]} sorted, with `/` separators, relative to `root`. @es Ordenados, con `/`, relativos a `root`.
 */
export function listPopulation(root) {
  const listed = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

  if (listed.error !== undefined || listed.status !== 0) {
    const reason = (listed.error?.message ?? listed.stderr ?? '').trim();

    throw new Error(`Cannot list the files of ${root} with git: ${reason} @es No se pueden listar los ficheros de ${root} con git: ${reason}`);
  }

  return listed.stdout
    .split('\0')
    .filter((file) => file !== '' && existsSync(path.join(root, file)))
    .toSorted();
}

/**
 * @param {{ files: string[], readText: (file: string) => string | undefined, plan: (campaign: string) => { targets: string[], problems: string[] } | undefined, declared: { file: string, why: string }[] }} options
 * @returns {{ deciding: { file: string, reasons: string[], campaigns: string[] }[], gaps: string[], optional: { file: string, campaigns: string[] }[], outOfReach: { file: string, reasons: string[] }[], problems: string[] }}
 * @es Los módulos que deciden con sus campañas, los huecos, lo opcional, lo fuera de alcance y los problemas.
 */
export function scopeOf({ files, readText, plan, declared }) {
  const found = decidingModules({ files, readText, declared });
  const problems = [...found.problems];
  const covering = new Map();

  for (const campaign of files.filter(isCampaignFile)) {
    const planned = plan(campaign);

    problems.push(...planned.problems.map((problem) => `campaign ${campaign}: ${problem}`));

    for (const target of planned.targets) covering.set(target, [...(covering.get(target) ?? []), campaign]);
  }

  const campaignsOf = (file) => (covering.get(file) ?? []).toSorted();
  const deciding = [...found.modules.keys()].toSorted().map((file) => ({ file, reasons: found.modules.get(file), campaigns: campaignsOf(file) }));

  return {
    deciding,
    gaps: deciding.filter((entry) => entry.campaigns.length === 0).map((entry) => entry.file),
    optional: [...covering.keys()]
      .filter((file) => !found.modules.has(file))
      .toSorted()
      .map((file) => ({ file, campaigns: campaignsOf(file) })),
    outOfReach: [...found.outOfReach.keys()].toSorted().map((file) => ({ file, reasons: found.outOfReach.get(file) })),
    problems
  };
}

/** The process exit code of a scope: a problem outranks a gap. @es El código de salida de un alcance: un problema pesa más que un hueco. */
export function exitCodeOf(scope) {
  if (scope.problems.length > 0) return EXIT_NOT_MEASURED;

  return scope.gaps.length > 0 ? EXIT_GAP : 0;
}

/** The report of a scope, one line each, in both languages. @es El informe de un alcance, una línea cada uno, en ambos idiomas. */
export function renderScope(scope) {
  const covered = scope.deciding.length - scope.gaps.length;
  const lines = [`${scope.deciding.length} deciding module(s), ${covered} covered, ${scope.gaps.length} gap(s) @es ${scope.deciding.length} módulo(s) que deciden, ${covered} cubiertos, ${scope.gaps.length} hueco(s)`];

  for (const file of scope.gaps) {
    const reasons = scope.deciding.find((entry) => entry.file === file).reasons.join('; ');

    lines.push(`GAP      ${file} — no mutants campaign mutates it (${reasons}) @es ninguna campaña de mutantes lo muta`);
  }

  for (const problem of scope.problems) lines.push(`PROBLEM  ${problem}`);

  for (const entry of scope.outOfReach) lines.push(`OUT OF REACH ${entry.file} (${entry.reasons.join('; ')}) — the runner parses JavaScript only @es el corredor solo parsea JavaScript`);

  if (scope.optional.length > 0) {
    lines.push(`OPTIONAL ${scope.optional.length} module(s) are mutated though they do not decide: information only, keep or drop, the owner decides @es se mutan sin decidir: solo información, conservar o quitar lo decide el dueño`);

    for (const entry of scope.optional) lines.push(`OPTIONAL ${entry.file} (${entry.campaigns.join(', ')})`);
  }

  if (scope.gaps.length === 0 && scope.problems.length === 0) lines.push('OK       no deciding module without a campaign @es ningún módulo que decide sin campaña');

  return lines;
}

/**
 * The deciding modules a repository DECLARES, from its own `mutation-proof/declared-deciding.mjs`: the list
 * names that repository's modules, so it is read from the repository being measured and never from the copy of
 * this check that happens to run. No file means nothing declared.
 * @es Los módulos que un repositorio DECLARA, de su propio `mutation-proof/declared-deciding.mjs`; sin fichero, nada declarado.
 */
async function declaredIn(root) {
  const file = path.join(root, 'mutation-proof', 'declared-deciding.mjs');

  if (!existsSync(file)) return [];

  const { DECLARED_DECIDING } = await import(pathToFileURL(file).href);

  if (!Array.isArray(DECLARED_DECIDING)) throw new Error(`${file} does not export the DECLARED_DECIDING list @es no exporta la lista DECLARED_DECIDING`);

  return DECLARED_DECIDING;
}

/** The scope of the repository at `root`, planning every campaign it holds. @es El alcance del repositorio en `root`. */
export async function measureRepository(root) {
  const files = listPopulation(root);

  return scopeOf({ files, declared: await declaredIn(root), readText: (file) => readFileSync(path.join(root, file), 'utf8'), plan: (campaign) => planCampaign({ root, campaign }) });
}

/** The repository this copy of the check lives in: `mutation-proof/` sits directly under it. @es El repositorio de esta copia del chequeo. */
const OWN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Reads the command line: nothing, or `--root <dir>`. @es Lee la línea de órdenes: nada, o `--root <dir>`. */
function rootOf(argv) {
  if (argv.length === 0) return OWN_ROOT;

  return argv.length === 2 && argv[0] === '--root' ? path.resolve(argv[1]) : undefined;
}

async function main() {
  const root = rootOf(process.argv.slice(2));

  if (root === undefined) {
    console.error('Usage: node scope.mjs [--root <repository>] @es Uso: node scope.mjs [--root <repositorio>]');

    return EXIT_NOT_MEASURED;
  }

  try {
    const scope = await measureRepository(root);

    console.log(renderScope(scope).join('\n'));

    return exitCodeOf(scope);
  } catch (error) {
    console.error(`NOT MEASURED — ${error instanceof Error ? error.message : String(error)} @es NO MEDIDO`);

    return EXIT_NOT_MEASURED;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = await main();
