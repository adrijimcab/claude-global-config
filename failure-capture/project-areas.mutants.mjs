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
const HEADER = 'failure-capture/area-ledger-header.mjs';

const END_TO_END = [
  // --- the declaration
  ['an absent declaration is a problem', DECLARED, 'if (areas === undefined) return [];', ''],
  ['areas that is not an object is accepted', DECLARED, "if (typeof areas !== 'object' || areas === null || Array.isArray(areas)) return [", 'if (false) return ['],
  ['a name that is not kebab-case is accepted', DECLARED, '...(isValidKey(name) ? [] :', '...(true ? [] :'],
  ['an area that is not an object is accepted', DECLARED, "...(typeof area === 'object' && area !== null && !Array.isArray(area) ? [] :", '...(true ? [] :'],
  ['an area that is a list is accepted', DECLARED, "typeof area === 'object' && area !== null && !Array.isArray(area)", "typeof area === 'object' && area !== null"],
  ['a null area is accepted', DECLARED, "typeof area === 'object' && area !== null && !Array.isArray(area)", "typeof area === 'object' && !Array.isArray(area)"],
  ['an area with no "about" is accepted', DECLARED, '...(isWritableAbout(area?.about) ? [] :', '...(true ? [] :'],
  ['an empty "about" is accepted', DECLARED, "typeof about === 'string' && about.length > 0 &&", "typeof about === 'string' &&"],
  ['an "about" with a line feed is accepted', DECLARED, "!about.includes('\\n') && ", ''],
  ['an "about" with a carriage return is accepted', DECLARED, " && !about.includes('\\r')", ''],
  ['an area with no paths is accepted', DECLARED, '...(Array.isArray(area?.paths) && area.paths.length > 0 && area.paths.every(isWritableGlob) ? [] :', '...(true ? [] :'],
  ['an empty paths list is accepted', DECLARED, 'Array.isArray(area?.paths) && area.paths.length > 0 &&', 'Array.isArray(area?.paths) &&'],
  ['the globs are not checked', DECLARED, 'area.paths.every(isWritableGlob)', 'area.paths.every(() => true)'],
  ['an empty glob is accepted', DECLARED, 'typeof glob === \'string\' && glob.length > 0 &&', "typeof glob === 'string' &&"],
  ['a glob that is not text is accepted', DECLARED, "typeof glob === 'string' && glob.length > 0 &&", 'glob.length > 0 &&'],
  ['a glob with a double quote is accepted', DECLARED, "character === '\"' ||", 'false ||'],
  ['a glob with a backslash is accepted', DECLARED, "character === '\\\\' || ", ''],
  ['a glob with a control character is accepted', DECLARED, "character === '\\\\' || isControl(character)", "character === '\\\\'"],
  ['a control character below space is accepted', DECLARED, 'character.charCodeAt(0) < 0x20 ||', 'false ||'],
  ['DEL is accepted', DECLARED, ' || character.charCodeAt(0) === 0x7f', ''],
  ['a glob that matches every file is accepted', DECLARED, "area.paths.some((glob) => typeof glob === 'string' && matchesEverything(glob)) ?", 'false ?'],
  ['"**/*" is not read as every file', DECLARED, " || rest.endsWith('/*')", ''],
  ['"**/**" is not read as every file', DECLARED, "rest.endsWith('/**') || ", ''],
  ['no glob is read as every file', DECLARED, "return rest === '**';", 'return false;'],
  ['the Windows separators of a glob are kept', DECLARED, "glob.replaceAll('\\\\', '/')", 'glob'],
  ['a backslash is not escaped in the frontmatter', HEADER, ".replaceAll('\\\\', '\\\\\\\\')", ''],
  ['a double quote is not escaped in the frontmatter', HEADER, ".replaceAll('\"', '\\\\\"')", ''],
  ['an unknown key inside an area is accepted', DECLARED, ".filter((key) => key !== 'about' && key !== 'paths')", '.filter(() => false)'],
  ['a refusal of the declaration loses its Spanish half', DECLARED, '@es "areas" debe ser un objeto nombre de área -> { about, paths }', ''],

  // --- where the declaration is read and what it gives
  ['the areas key is unknown to the project config', PROJECT, "'loadedSetCeiling', 'areas'];", "'loadedSetCeiling'];"],
  ['the areas of a project config are not validated', PROJECT, 'const declared = areaProblems(config.areas);', 'const declared = [];'],
  ['the declared globs are not normalised when the config is read', PROJECT, 'if (config.areas !== undefined) config.areas = normalizedAreas(config.areas);', ''],
  ['an area dropped while its file holds lessons is accepted', PROJECT, '...(declared.length === 0 ? strandedAreaProblems(root, config.areas,', '...(false ? strandedAreaProblems(root, config.areas,'],
  ['a deleted config strands no area ledger', PROJECT, "    if (stranded.length > 0) throw new Error(`${file} is absent: ${stranded.join('; ')}`);\n", ''],
  ['any lessons-*.md file is read as an area ledger, by its name alone', PROJECT, '    .filter(({ area, text }) => isAreaLedgerText(area, text))\n', ''],
  ['every text is recognised as an area ledger', HEADER, "  const lines = text.split('\\n');\n\n  if (lines[0]", "  return true;\n  const lines = text.split('\\n');\n\n  if (lines[0]"],
  ['the header capture.mjs writes is not recognised as an area ledger', HEADER, "  return aboutEnd > 0 && !afterHead.slice(0, aboutEnd).includes('\\n');", '  return false;'],
  ['a declared area is read as dropped', PROJECT, '!Object.hasOwn(areas ?? {}, area)', 'true'],
  ['a dropped area whose file holds no lesson is refused', PROJECT, '.filter(({ count }) => count > 0)', ''],
  ['any line of a dropped area file counts as a lesson', PROJECT, 'line.startsWith(ENTRY_PREFIX)', 'true'],
  ['a rules file that is not a lessons ledger is read as an area ledger', PROJECT, "name.startsWith(AREA_FILE_PREFIX) && name.endsWith(AREA_FILE_SUFFIX)", 'name.endsWith(AREA_FILE_SUFFIX)'],
  ['a lessons file that is not markdown is read as an area ledger', PROJECT, "name.startsWith(AREA_FILE_PREFIX) && name.endsWith(AREA_FILE_SUFFIX)", 'name.startsWith(AREA_FILE_PREFIX)'],
  ['the refusal of a dropped area loses its Spanish half', PROJECT, '@es el área "${area}" ya no está declarada, pero .claude/rules/${name} aún tiene ${String(count)} lección(es) que ninguna captura vería; vuelve a declararla y devuelve cada lección al ledger del proyecto con "capture.mjs route --key <clave> --to ${scope} --write" antes de quitarla o renombrarla', ''],
  ['the refusal of a dropped area does not name the command that moves its lessons back', PROJECT, 'move each lesson back to the project ledger with "capture.mjs route --key <key> --to ${scope} --write"', 'route its lessons out'],
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
  ['a spooled entry of a project with an invalid declaration is not left in the spool', COMMAND, 'if (areas === undefined) return undefined;', ''],
  ['a spooled entry whose scope has no ledger throws and wedges the spool', COMMAND, 'if (found === undefined && !ledgers.some((ledger) => ledger.scope === entry.scope)) {', 'if (false) {'],
  ['the reason a spooled entry was deferred is not recorded', COMMAND, '  if (deferred?.reason !== reason) {\n', '  if (false) {\n'],
  ['a capture that leaves a spooled entry behind does not say so', COMMAND, '        left.push({ key: entry.key, reason: deferEntry(full, entry, deferred) });', '        deferEntry(full, entry, deferred);'],
  ['the entries left in the spool are counted but not named with their reason', COMMAND, '    for (const one of left) speaker.data(`  ${one.key}: ${one.reason}`);\n', ''],
  ['the reason an entry was left is not given back', COMMAND, '    renameSync(temp, full);\n  }\n\n  return reason;', '    renameSync(temp, full);\n  }\n\n  return undefined;'],
  ['the note of entries left in the spool loses its Spanish half', 'failure-capture/capture-messages.mjs', "es: 'NOTA: {count} captura(s) del spool no se pudieron plegar y se quedan en el spool (clave: por qué):'", "es: 'NOTA:'"],
  ['a recorded deferral is folded into the incident log as part of the capture', COMMAND, 'const { deferred, ...entry } = spooled;', 'const { deferred } = spooled;\n      const entry = spooled;'],
  ['the reason of a deferral loses its Spanish half', COMMAND, ' @es ningún ledger tiene ya el alcance "${entry.scope}" (el proyecto ya no declara esa área), así que esta captura se queda en el spool hasta que el alcance se declare de nuevo.', ''],
  ['route --headers leaves the project area files out', COMMAND, '...Object.keys(PROJECT?.areas ?? {})];', '];']
];

const PURE = [
  ['the project areas are not known to the plan', PLAN, 'const projectAreas = Object.keys(project?.areas ?? {});', 'const projectAreas = [];'],
  ['a project lesson is looked for under the home scope', PLAN, 'const sourceScope = ofProject ? project.scope : GLOBAL_SCOPE;', 'const sourceScope = GLOBAL_SCOPE;'],
  ['a home-area lesson is looked for under the project scope', PLAN, 'const sourceScope = ofProject ? project.scope : GLOBAL_SCOPE;', 'const sourceScope = project?.scope ?? GLOBAL_SCOPE;'],
  ['a line tagged for another scope is moved out of the project ledger', PLAN, 'found.ledger.scope !== sourceScope || !found.line.startsWith(prefix)', 'found.ledger.scope !== sourceScope'],
  ['the refusal does not list the project areas', PLAN, 'const allAreas = [...areaScopes(), ...projectAreas];', 'const allAreas = [...areaScopes()];'],
  ['the refusal does not say which kind of area it was', PLAN, "to the ${ofProject ? 'project' : 'home'} area", 'to the home area'],
  ['a plan that loses a line is still written', PLAN, 'if (!planned.ok) return { ...planned, written: false };\n\n  return commitTransaction', 'return commitTransaction'],
  ['a refused plan is not marked as never written', PLAN, 'return { ...planned, written: false };\n\n  return commitTransaction', 'return planned;\n\n  return commitTransaction'],
  ['a refused plan is reported as a failed write', PLAN, "proof.written === false ? 'route.planUnproven' : 'route.proofFailed'", "'route.proofFailed'"],
  ['the plan is proved against something other than the plan', PLAN, 'after: { source: plan.source, destination: plan.destination }, renamed: plan.renamed });\n\n  if (!planned.ok)', 'after: before, renamed: plan.renamed });\n\n  if (!planned.ok)'],
  ['a rename that rewords a line is accepted', PLAN, '...rewordedRenames.map(', '...[].map('],
  ['a rename of a line with no scope tag is accepted', PLAN, 'tagEnd(from) !== -1 && ', ''],
  ['any rename of a tagged line is accepted', PLAN, 'from.slice(tagEnd(from)) === to.slice(tagEnd(to))', 'true']
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaign = (selftest, mutants) => runMutants({ fleetRoot, paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'], selftest, mutants, crashKills: 'fail' });
const survivors = campaign('failure-capture/project-areas.selftest.mjs', END_TO_END) + campaign('failure-capture/ledger-route.selftest.mjs', PURE);

process.exit(survivors === 0 ? 0 : 1);
