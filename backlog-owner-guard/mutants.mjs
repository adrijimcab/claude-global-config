#!/usr/bin/env node
/**
 * The decisions of `backlog-owner-guard`, each broken once, that `selftest.mjs` must catch. The runner
 * and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * Both directions, as the sibling `collision-guard` campaign does: a mutant that lets a subagent write
 * to the master backlog through, and a mutant that would refuse a call that loses nothing (the main
 * session, or a genuinely non-master target) — the second is what gets a guard switched off within the
 * hour.
 *
 * @es Las decisiones de la guardia, rotas una a una. Ambas direcciones: la que deja pasar a un subagente
 * hacia el backlog maestro, y la que rechazaría una llamada que no protege nada — esta última es la que
 * hace que alguien la apague.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // Caller identity (`hook-caller/identify-caller.mjs`) is mutated by `hook-caller/mutants.mjs`.
  // @es La identidad del llamante la muta `hook-caller/mutants.mjs`.

  // --- decide.mjs: the caller gate ---
  ['the main-session/subagent gate is inverted: the orchestrator gets refused, subagents get through', 'backlog-owner-guard/decide.mjs', 'if (!isSubagentCaller(payload)) return undefined;', 'if (isSubagentCaller(payload)) return undefined;'],

  // --- decide.mjs: which tools this guard even looks at ---
  ["mem_save stops being recognised as a save-family tool, so it is never judged", 'backlog-owner-guard/decide.mjs', 'function isSaveTool(toolName) {\n  return SAVE_TOOLS.has(toolName);\n}', 'function isSaveTool(toolName) {\n  return false;\n}'],
  ['mem_update/mem_delete require BOTH set memberships instead of either', 'backlog-owner-guard/decide.mjs', 'return UPDATE_TOOLS.has(toolName) || DELETE_TOOLS.has(toolName);', 'return UPDATE_TOOLS.has(toolName) && DELETE_TOOLS.has(toolName);'],
  ['an unrelated tool is no longer short-circuited, and falls through to the id-targeting branch', 'backlog-owner-guard/decide.mjs', 'if (!isSave && !isIdTargeting) return undefined; // not one of this guard\'s tools', 'if (false) return undefined; // not one of this guard\'s tools'],
  ['the plugin-mounted mem_update name is dropped from UPDATE_TOOLS', 'backlog-owner-guard/decide.mjs', "export const UPDATE_TOOLS = new Set(['mcp__engram__mem_update', 'mcp__plugin_engram_engram__mem_update']);", "export const UPDATE_TOOLS = new Set(['mcp__engram__mem_update']);"],

  // --- decide.mjs: the three master-shape checks, each mutated independently ---
  ['a mem_save onto the master topic_key is judged BACKWARDS: master passes, non-master is refused', 'backlog-owner-guard/decide.mjs', "if (typeof topicKey !== 'string' || !isMasterBacklogTopicKey(topicKey)) return undefined;", "if (typeof topicKey !== 'string' || isMasterBacklogTopicKey(topicKey)) return undefined;"],
  ['retargeting a row onto a master-shaped topic_key is never detected', 'backlog-owner-guard/decide.mjs', "if (typeof newTopicKey === 'string' && isMasterBacklogTopicKey(newTopicKey)) {", "if (typeof newTopicKey === 'string' && false) {"],
  ['an id that resolves to the master row is never recognised as targeting it', 'backlog-owner-guard/decide.mjs', 'if (isMasterBacklogTopicKey(resolution.topicKey)) {', 'if (false) {'],

  // --- decide.mjs: the fail-CLOSED path for an unresolvable id ---
  ['an unresolvable id (no-id, not-found, store-unreadable, query-failed) is no longer refused — the ONE place this guard fails closed instead of open', 'backlog-owner-guard/decide.mjs', "if ('error' in resolution) {", 'if (false) {'],

  // --- resolve-topic-key.mjs: every distinct resolution outcome ---
  ['a non-finite id stops being reported as no-id', 'backlog-owner-guard/resolve-topic-key.mjs', "if (!Number.isFinite(id)) return { error: 'no-id' };", "if (false) return { error: 'no-id' };"],
  ['a missing database file stops being reported as store-unreadable', 'backlog-owner-guard/resolve-topic-key.mjs', "if (!existsSync(databasePath)) return { error: 'store-unreadable' };", "if (false) return { error: 'store-unreadable' };"],
  ['a row that does not exist stops being reported as not-found', 'backlog-owner-guard/resolve-topic-key.mjs', "if (row === undefined) return { error: 'not-found' };", "if (false) return { error: 'not-found' };"],
  ['a resolved topic_key is always reported as null, regardless of the real value', 'backlog-owner-guard/resolve-topic-key.mjs', "return { topicKey: typeof topicKey === 'string' ? topicKey : null };", 'return { topicKey: null };'],
  ['ENGRAM_DATA_DIR is ignored, so a caller pointed at a different store is silently redirected to the default', 'backlog-owner-guard/resolve-topic-key.mjs', "const dataDir = typeof override === 'string' && override.trim().length > 0 ? override : path.join(os.homedir(), '.engram');", "const dataDir = path.join(os.homedir(), '.engram');"],

  // --- resolve-topic-key.mjs: the lazy, silenced node:sqlite load (measured 2026-10-04) ---
  ['a Node without node:sqlite stops being reported as store-unreadable: the absent module is no longer detected', 'backlog-owner-guard/resolve-topic-key.mjs', "if (sqlite === undefined) return { error: 'store-unreadable' };", 'if (false) return { error: \'store-unreadable\' };'],
  ['a loader that throws stops being contained: it is read as a loaded module instead of an unreadable store', 'backlog-owner-guard/resolve-topic-key.mjs', 'return load();\n  } catch {\n    return undefined;', 'return load();\n  } catch {\n    return {};'],
  ['the injected loader is ignored, so the real node:sqlite is always used', 'backlog-owner-guard/resolve-topic-key.mjs', 'loadedSqlite(options.loadSqlite ?? loadSqlite)', 'loadedSqlite(loadSqlite)'],
  ['the SQLite notice is no longer dropped, so every hook process prints it on stderr', 'backlog-owner-guard/resolve-topic-key.mjs', 'if (isSqliteNotice) return;', 'if (false) return;'],
  ['the silencer drops a same-text notice of ANY type, not only the ExperimentalWarning', 'backlog-owner-guard/resolve-topic-key.mjs', "const isSqliteNotice = type === 'ExperimentalWarning' && String(warning)", 'const isSqliteNotice = String(warning)'],
  ['the silencer drops EVERY ExperimentalWarning, not only the SQLite one', 'backlog-owner-guard/resolve-topic-key.mjs', "type === 'ExperimentalWarning' && String(warning).includes(SQLITE_EXPERIMENTAL_NOTICE);", "type === 'ExperimentalWarning';"],
  ['process.emitWarning is left patched after the load', 'backlog-owner-guard/resolve-topic-key.mjs', '  } finally {\n    process.emitWarning = original;\n  }', '  } finally {\n    // restore skipped\n  }'],

  // --- guard.mjs: the shim itself ---
  ['the allow/refuse branch is inverted: an allowed call is journalled and denied, a refused one is let through', 'backlog-owner-guard/guard.mjs', 'if (refusal === undefined) return undefined;', 'if (refusal !== undefined) return undefined;'],
  ['the hook decision is flipped from deny to allow', 'backlog-owner-guard/guard.mjs', "permissionDecision: 'deny',", "permissionDecision: 'allow',"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['backlog-owner-guard', 'backlog-guard', 'hook-caller', 'hook-state', 'bilingual-output'],
  selftest: 'backlog-owner-guard/selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
