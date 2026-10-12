#!/usr/bin/env node
/**
 * The decisions of odd-mirror-guard, each broken once, that `selftest.mjs` must catch. The runner and its rules
 * (green baseline first, exactly-once targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de odd-mirror-guard, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  ['an absent mirror is not a finding', 'odd-mirror-guard/mirror-verdict.mjs', "findings.push({ feature, kind: 'missing', documentAt, documentSeconds });", ''],
  ['a stale mirror is not a finding', 'odd-mirror-guard/mirror-verdict.mjs', 'documentSeconds > mirrorSeconds', 'documentSeconds > mirrorSeconds + 1e9'],
  ['a mirror written the same second as the file counts as stale', 'odd-mirror-guard/mirror-verdict.mjs', 'documentSeconds > mirrorSeconds', 'documentSeconds >= mirrorSeconds'],
  ['the project is not matched, so another project\'s mirror counts', 'odd-mirror-guard/mirror-verdict.mjs', 'normalized(candidate.project) === project', 'true'],
  ['the project name keeps its separators, so `Foo_Bar` is not `foo-bar`', 'odd-mirror-guard/mirror-verdict.mjs', ".replaceAll(/[^a-z0-9]/g, '')", ''],
  ['an engram timestamp is read as local time instead of UTC', 'odd-mirror-guard/mirror-verdict.mjs', ': `${text}Z`;', ': text;'],
  ['a store that cannot be read leaves no record of the malfunction', 'odd-mirror-guard/guard.mjs', 'for (const item of unmeasured) note(', 'for (const item of []) note('],
  ['every document is judged, whoever wrote it', 'odd-mirror-guard/guard.mjs', 'judgeMirrors(projectRoot, own.documents,', 'judgeMirrors(projectRoot, listed.documents,'],
  ['documents are matched on a relative path, so none is ever this session\'s', 'odd-mirror-guard/session-documents.mjs', "path.resolve(projectRoot, 'odd', 'tasks')", "path.join('odd', 'tasks')"],
  ['an unreadable transcript is read as having written everything', 'odd-mirror-guard/session-documents.mjs', 'return { error: error instanceof Error ? error.message : String(error) };', 'return { documents };'],
  ['the project with no documents still reads the transcript', 'odd-mirror-guard/guard.mjs', 'if (listed.documents.length === 0) return undefined;', ''],
  ['the transcript error is not recorded', 'odd-mirror-guard/guard.mjs', "event: 'transcript-unread'", "event: 'x'"],
  ['a non-Markdown file is treated as a document', 'odd-mirror-guard/feature-documents.mjs', "entry.name.endsWith('.md')", 'true'],
  ['a subagent caller is judged', 'odd-mirror-guard/guard.mjs', 'if (isSubagentCaller(payload) || payload?.hook_event_name === \'SubagentStop\') return undefined;', ''],
  ['`stop_hook_active` is ignored, so a refusal can loop', 'odd-mirror-guard/guard.mjs', 'if (payload?.stop_hook_active === true) return undefined;', ''],
  ['noticing is forgotten, so the refusal repeats every turn', 'odd-mirror-guard/guard.mjs', 'if (alreadyShown(stateDir, sessionId, fingerprint)) {', 'if (false) {'],
  ['the fingerprint ignores WHICH features, so a new finding goes unseen', 'odd-mirror-guard/guard.mjs', "`${finding.kind}|${finding.feature}|${finding.documentSeconds}`", "`${finding.kind}`"],
  ['a failure to record the notice still refuses', 'odd-mirror-guard/guard.mjs', 'if (!markShown(stateDir, sessionId, fingerprint, now)) {', 'if (false) {'],
  ['the refusal drops the Spanish half', 'odd-mirror-guard/report.mjs', "'@es Un documento ODD", "'Un documento ODD"],
  ['the refusal stops saying MISSING', 'odd-mirror-guard/report.mjs', 'mirror MISSING', 'mirror absent'],
  ['the refusal stops showing the stale instants', 'odd-mirror-guard/report.mjs', '(engram ${finding.mirrorAt} UTC is older than the file ${finding.documentAt} UTC;', '(older;'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['odd-mirror-guard', 'config-sync-guard', 'backlog-content-guard', 'backlog-owner-guard', 'integrated-worktree-guard', 'hook-caller', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'odd-mirror-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
