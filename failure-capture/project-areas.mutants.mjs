#!/usr/bin/env node
/**
 * The decisions of PROJECT AREAS (`project-areas.mjs`, their reading in `project.mjs`, their ledgers in
 * `ledgers.mjs`, their scopes in `loop-context.mjs`, their routing in `ledger-route.mjs` and `capture.mjs`), each
 * broken once. The command-level and declaration decisions are caught by `project-areas.selftest.mjs`; the pure
 * routing and no-loss decisions by `ledger-route.selftest.mjs`. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de las ÁREAS DE PROYECTO, rotas una a una. Las del comando y la declaración las atrapa
 * `project-areas.selftest.mjs`; las del enrutamiento puro y la prueba de no-pérdida, `ledger-route.selftest.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DECLARED = 'failure-capture/project-areas.mjs';
const PROJECT = 'failure-capture/project.mjs';
const LEDGERS = 'failure-capture/ledgers.mjs';
const LOOP = 'failure-capture/loop-context.mjs';
const COMMAND = 'failure-capture/capture.mjs';
const PLAN = 'failure-capture/ledger-route.mjs';

const END_TO_END = [
  // --- the declaration
  ['an absent declaration is a problem', DECLARED, 'if (areas === undefined) return [];', ''],
  ['areas that is not an object is accepted', DECLARED, "if (typeof areas !== 'object' || areas === null || Array.isArray(areas)) return [", 'if (false) return ['],
  ['a name that is not kebab-case is accepted', DECLARED, '...(isValidKey(name) ? [] :', '...(true ? [] :'],
  ['an area that is not an object is accepted', DECLARED, "...(typeof area === 'object' && area !== null && !Array.isArray(area) ? [] :", '...(true ? [] :'],
  ['an area that is a list is accepted', DECLARED, "typeof area === 'object' && area !== null && !Array.isArray(area)", "typeof area === 'object' && area !== null"],
  ['a null area is accepted', DECLARED, "typeof area === 'object' && area !== null && !Array.isArray(area)", "typeof area === 'object' && !Array.isArray(area)"],
  ['an area with no "about" is accepted', DECLARED, "...(typeof area?.about === 'string' && area.about.length > 0 ? [] :", '...(true ? [] :'],
  ['an empty "about" is accepted', DECLARED, "typeof area?.about === 'string' && area.about.length > 0", "typeof area?.about === 'string'"],
  ['an area with no paths is accepted', DECLARED, '...(Array.isArray(area?.paths) && area.paths.length > 0 && area.paths.every(isWritableGlob) ? [] :', '...(true ? [] :'],
  ['an empty paths list is accepted', DECLARED, 'Array.isArray(area?.paths) && area.paths.length > 0 &&', 'Array.isArray(area?.paths) &&'],
  ['the globs are not checked', DECLARED, 'area.paths.every(isWritableGlob)', 'area.paths.every(() => true)'],
  ['an empty glob is accepted', DECLARED, 'typeof glob === \'string\' && glob.length > 0 &&', "typeof glob === 'string' &&"],
  ['a glob that is not text is accepted', DECLARED, "typeof glob === 'string' && glob.length > 0 &&", 'glob.length > 0 &&'],
  ['a glob with a double quote is accepted', DECLARED, "character === '\"' ||", 'false ||'],
  ['a glob with a line feed is accepted', DECLARED, "character === '\\n' ||", 'false ||'],
  ['a glob with a carriage return is accepted', DECLARED, "character === '\\r'", 'false'],
  ['an unknown key inside an area is accepted', DECLARED, ".filter((key) => key !== 'about' && key !== 'paths')", '.filter(() => false)'],
  ['a refusal of the declaration loses its Spanish half', DECLARED, '@es "areas" debe ser un objeto nombre de área -> { about, paths }', ''],

  // --- where the declaration is read and what it gives
  ['the areas key is unknown to the project config', PROJECT, "'loadedSetCeiling', 'areas'];", "'loadedSetCeiling'];"],
  ['the areas of a project config are not validated', PROJECT, '...areaProblems(config.areas)', '...[]'],
  ['the project context does not surface its areas', PROJECT, 'areas: config.areas ?? {}', 'areas: {}'],
  ['a project area ledger lives outside the project rules folder', PROJECT, "path.join(root, '.claude', 'rules', `lessons-${area}.md`)", "path.join(root, '.claude', `lessons-${area}.md`)"],
  ['the areas of a ledger are not read from its project config', PROJECT, 'readProjectConfig(path.dirname(path.dirname(ledgerFile))).areas ?? {}', '{}'],
  ['a project without areas has none, not undefined', PROJECT, 'readProjectConfig(path.dirname(path.dirname(ledgerFile))).areas ?? {}', 'readProjectConfig(path.dirname(path.dirname(ledgerFile))).areas'],
  ['an unreadable declaration reads as no areas', PROJECT, '  } catch {\n    return undefined;\n  }', '  } catch {\n    return {};\n  }'],

  // --- the ledgers and scopes of a project with areas
  ['the project ledgers leave out the project areas', LEDGERS, 'Object.assign(files, projectAreaLedgerFiles(project));', ''],
  ['a ledger write assumes the folder exists', LEDGERS, 'mkdirSync(path.dirname(ledger.file), { recursive: true });', ''],
  ['a project area is not a scope a capture may declare', LOOP, '[project.scope, ...projectAreas])]', '[project.scope])]'],
  ['a project area named like a home scope or the project scope is accepted', LOOP, 'if (shadowing.length > 0) throw', 'if (false) throw'],
  ['a project area may take a home scope', LOOP, 'isReservedScope(area) || area === project.scope', 'area === project.scope'],
  ['a project area may take the project\'s own scope', LOOP, 'isReservedScope(area) || area === project.scope', 'isReservedScope(area)'],

  // --- the help text
  ['the English help does not mention the project areas', 'failure-capture/capture-messages.mjs', 'one this project declares as "areas"', 'one this project declares'],
  ['the Spanish help does not mention the project areas', 'failure-capture/capture-messages.mjs', 'una que este proyecto declara como "areas"', 'una que este proyecto declara'],
  ['the English help does not mention the no-loss refusal', 'failure-capture/capture-messages.mjs', 'unless no lesson line is lost, duplicated or reworded', 'unless safe'],
  ['the Spanish help does not mention the no-loss refusal', 'failure-capture/capture-messages.mjs', 'salvo que no se pierda, duplique ni reescriba ninguna línea de lección', 'salvo que sea seguro'],

  // --- the command
  ['the route does not know the project it runs in', COMMAND, ', project: PROJECT === undefined ? undefined : { scope: PROJECT.scope, areas: PROJECT.areas } }) });', ' }) });'],
  ['a recurrence cannot see the area ledgers of a spooled entry', COMMAND, '...areaLedgers];', '];'],
  ['the area ledgers of a spooled entry are looked for in the wrong folder', COMMAND, 'root: path.dirname(path.dirname(project.ledgerFile)), areas', 'root: path.dirname(project.ledgerFile), areas'],
  ['a spooled entry of a project with an invalid declaration is not left in the spool', COMMAND, 'if (areas === undefined) return undefined;', '']
];

const PURE = [
  ['the project areas are not known to the plan', PLAN, 'const projectAreas = Object.keys(project?.areas ?? {});', 'const projectAreas = [];'],
  ['a project lesson is looked for under the home scope', PLAN, 'const sourceScope = ofProject ? project.scope : GLOBAL_SCOPE;', 'const sourceScope = GLOBAL_SCOPE;'],
  ['a home-area lesson is looked for under the project scope', PLAN, 'const sourceScope = ofProject ? project.scope : GLOBAL_SCOPE;', 'const sourceScope = project?.scope ?? GLOBAL_SCOPE;'],
  ['a line tagged for another scope is moved out of the project ledger', PLAN, 'found.ledger.scope !== sourceScope || !found.line.startsWith(prefix)', 'found.ledger.scope !== sourceScope'],
  ['the refusal does not list the project areas', PLAN, 'const allAreas = [...areaScopes(), ...projectAreas];', 'const allAreas = [...areaScopes()];'],
  ['the refusal does not say which kind of area it was', PLAN, "to the ${ofProject ? 'project' : 'home'} area", 'to the home area'],
  ['a plan that loses a line is still written', PLAN, 'if (!planned.ok) return { ...planned, written: false };', ''],
  ['a refused plan is not marked as never written', PLAN, 'return { ...planned, written: false };', 'return planned;'],
  ['a refused plan is reported as a failed write', PLAN, "proof.written === false ? 'route.planUnproven' : 'route.proofFailed'", "'route.proofFailed'"],
  ['the plan is proved against something other than the plan', PLAN, 'after: { source: plan.source, destination: plan.destination }, renamed: plan.renamed });\n\n  if (!planned.ok)', 'after: before, renamed: plan.renamed });\n\n  if (!planned.ok)'],
  ['a rename that rewords a line is accepted', PLAN, '...rewordedRenames.map(', '...[].map('],
  ['a rename of a line with no scope tag is accepted', PLAN, 'tagEnd(from) !== -1 && ', ''],
  ['any rename of a tagged line is accepted', PLAN, 'from.slice(tagEnd(from)) === to.slice(tagEnd(to))', 'true']
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaign = (selftest, mutants) => runMutants({ fleetRoot, paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'], selftest, mutants });
const survivors = campaign('failure-capture/project-areas.selftest.mjs', END_TO_END) + campaign('failure-capture/ledger-route.selftest.mjs', PURE);

process.exit(survivors === 0 ? 0 : 1);
