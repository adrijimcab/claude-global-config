#!/usr/bin/env node
/**
 * The decisions of the shared worker contract pointer, each broken once, that `selftest.mjs` must catch: which
 * lines of a CLAUDE.md are imports, which contract files a project has and from which source, which project a
 * payload belongs to, what the worker is told and how the hook answers. The campaign runner and its rules
 * (green baseline first, exactly-once targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`.
 * A mutant is never deleted or softened to get a clean campaign: a survivor is a missing assertion.
 *
 * @es Las decisiones del puntero de contrato compartido para workers, rotas una a una, que `selftest.mjs` debe
 * cazar: qué líneas de un CLAUDE.md son imports, qué ficheros de contrato tiene un proyecto y de qué fuente, a
 * qué proyecto pertenece un payload, qué se le dice al worker y cómo responde el hook. Un mutante nunca se borra
 * ni se ablanda: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const IMPORTS = 'subagent-contract-pointer/claude-md-imports.mjs';
const LOCATIONS = 'subagent-contract-pointer/contract-locations.mjs';
const POINTER = 'subagent-contract-pointer/worker-pointer.mjs';
const TEXT = 'subagent-contract-pointer/pointer-text.mjs';
const HOOK = 'subagent-contract-pointer/start-hook.mjs';

const MUTANTS = [
  // What is an import / Qué es un import
  ['a code fence does not hide its lines', IMPORTS, 'inFence = !inFence;', 'inFence = false;'],
  ['a line inside a fence is an import', IMPORTS, 'if (inFence || !line.startsWith', 'if (!line.startsWith'],
  ['a line that is not an @ line is an import', IMPORTS, "!line.startsWith('@') || ", ''],
  ['a line with a space (@es text) is an import', IMPORTS, "line.includes(' ') || ", ''],
  ['an @~ import (the owner global files) is the project contract', IMPORTS, " || line.startsWith('@~')) continue;", ') continue;'],
  ['an absolute import is followed', IMPORTS, 'if (path.win32.isAbsolute(target)) continue;', ''],
  ['an import is resolved from the process directory instead of the CLAUDE.md', IMPORTS, 'path.resolve(directory, target)', 'path.resolve(target)'],
  ['an import of a missing file is kept', IMPORTS, 'if (isFile(resolved) && !imported.includes(resolved))', 'if (!imported.includes(resolved))'],
  ['a directory counts as an imported file', IMPORTS, 'existsSync(candidate) && statSync(candidate).isFile()', 'existsSync(candidate)'],
  ['a repeated import is listed twice', IMPORTS, 'isFile(resolved) && !imported.includes(resolved)', 'isFile(resolved)'],
  // Which files / Qué ficheros
  ['a usable declaration is not the source', LOCATIONS, "if (declaration.status === 'ok') {", 'if (false) {'],
  ['the spanish contract is what a worker is pointed at', LOCATIONS, 'declaration.english.map', 'declaration.spanish.map'],
  ['declared files that are not on this machine are listed', LOCATIONS, '.filter((candidate) => existsSync(candidate));\n\n    if (declared.length > 0)', ';\n\n    if (declared.length > 0)'],
  ['a declaration with no file present stops the search instead of falling back', LOCATIONS, 'if (declared.length > 0) return', 'return'],
  ['the source of a declared contract is named as the imports', LOCATIONS, "return { source: 'anchors'", "return { source: 'claude-md'"],
  ['the CLAUDE.md under .claude is not read', LOCATIONS, "['.claude/CLAUDE.md', 'CLAUDE.md']", "['CLAUDE.md']"],
  ['the CLAUDE.md at the root is not read', LOCATIONS, "['.claude/CLAUDE.md', 'CLAUDE.md']", "['.claude/CLAUDE.md']"],
  ['a CLAUDE.md that does not exist is read', LOCATIONS, '.filter((candidate) => existsSync(candidate)).flatMap', '.flatMap'],
  ['a file imported by both CLAUDE.md files is listed twice', LOCATIONS, 'files: [...new Set(imports)]', 'files: imports'],
  // Which project / Qué proyecto
  ['the anchors declaration does not identify a project', POINTER, 'const ROOT_MARKERS = [ANCHORS_FILE, ...CLAUDE_MD_CANDIDATES];', 'const ROOT_MARKERS = [...CLAUDE_MD_CANDIDATES];'],
  ['a CLAUDE.md does not identify a project', POINTER, 'const ROOT_MARKERS = [ANCHORS_FILE, ...CLAUDE_MD_CANDIDATES];', 'const ROOT_MARKERS = [ANCHORS_FILE];'],
  ['a project whose marker has no contract file stops the search', POINTER, 'if (files.length > 0) return pointerText({ files });', 'return pointerText({ files });'],
  ['a project with no marker is pointed at nothing and the route rule is lost', POINTER, "directory: searchStarts(payload, env)[0] ?? path.resolve('.')", "directory: ''"],
  ['the searched directory is the process directory', POINTER, "searchStarts(payload, env)[0] ?? path.resolve('.')", "path.resolve('.')"],
  // What the worker is told / Qué se le dice
  ['the worker is not told to read the contract', TEXT, 'READ those files before anything else.', 'consult them if you wish.'],
  ['the reason (Explore does not load CLAUDE.md) is dropped', TEXT, 'Explore agents do not load CLAUDE.md', 'Some agents do not load CLAUDE.md'],
  ['the route rule drops the owner of the documents', TEXT, 'the orchestrator owns those documents.', 'those documents are shared.'],
  ['the route rule lets a worker touch a feature document', TEXT, 'Never create or edit an ODD feature document', 'You may edit an ODD feature document'],
  ['a brief with no ROUTE is not direct', TEXT, 'A brief with no ROUTE line is "direct"', 'A brief with no ROUTE line is "tracked-odd"'],
  ['the route rule is not appended', TEXT, "return [contract.join('\\n'), line('route-rule')].join('\\n\\n');", "return contract.join('\\n');"],
  ['the contract files are not listed', TEXT, '...located.files.map((file) => `  ${file}`), ', ''],
  ['a project with files is told none was found', TEXT, 'const contract = located.files.length > 0', 'const contract = located.files.length < 0'],
  // The hook / El hook
  ['the hook answers for another event', HOOK, "hookEventName: 'SubagentStart'", "hookEventName: 'PreToolUse'"],
  ['the hook does not strip a byte-order mark', HOOK, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['the hook delivers nothing', HOOK, 'additionalContext: workerPointer(payload, env)', "additionalContext: ''"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['subagent-contract-pointer', 'settings.json', 'agent-contract-parity', 'brief-feasibility', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'subagent-contract-pointer/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
