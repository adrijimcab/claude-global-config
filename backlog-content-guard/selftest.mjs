#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `backlog-content-guard` (`backlog-rewritten-from-summary-lost-detail`).
 *
 * THE STATE SPACE: the comparison unit (reorder, reflow, re-bullet, addition, bullet deleted, detail
 * replaced by a summary, an item edited in the middle), the closure marker (linked to the item, stray,
 * blanket, each closure word, feminine forms, too-short anchor), the target (first save, existing key,
 * another project, another scope, several rows, update by id, update without content), the store (readable,
 * unreadable for master and ordinary keys), tool families and mounts, and this guard's own malfunctions.
 * Store reads run against a REAL disposable sqlite database shaped like engram's `observations` table,
 * never a mocked reader.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `backlog-content-guard`. Espacio de estados: unidad de comparación,
 * marcador de cierre, objetivo, almacén y fallos propios. Las lecturas corren contra una base sqlite REAL
 * y desechable con la forma de `observations`, nunca un lector simulado.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { citedArchiveIds } from './archive.mjs';
import { readRevisionById, readRevisionsByTopicKey } from './current-revision.mjs';
import { decide } from './decide.mjs';
import { evaluate } from './guard.mjs';
import { extractItems } from './items.mjs';
import { droppedItems } from './loss.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('backlog-content-guard');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── a real, disposable sqlite database shaped like engram's own `observations` table ────────────────
const scratch = mkdtempSync(path.join(tmpdir(), 'backlog-content-guard-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
const databasePath = path.join(scratch, 'engram.db');
const db = new DatabaseSync(databasePath);

db.exec(`CREATE TABLE observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT, scope TEXT NOT NULL DEFAULT 'project',
  topic_key TEXT, content TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT)`);

const DETAIL = [
  '## Open findings',
  '',
  '- #35 forms finding: file src/forms/form.ts, spy evidence in form.spec.ts, markForCheck sites at three places.',
  '- #36 table editor: error state is not announced to screen readers under the zoneless scheduler.',
  '- #37 date-range: endpoint inputs ignore parent control events when disabled.',
  '',
  'The rollout plan keeps every gate green before landing and never batches fixes into a single large diff, because batched fixes hide regressions.',
  '',
  '1. Regenerate the goldens deliberately with api:update.',
  '2. Run the full unit suite before every fast-forward.'
].join('\n');

const insert = db.prepare('INSERT INTO observations (project, scope, topic_key, content, deleted_at) VALUES (?, ?, ?, ?, ?)');

insert.run('b100-am-ui', 'project', 'backlog/1.0.0-bilingual-gate-hardening', DETAIL, null); // id 1
insert.run('b100-am-ui', 'project', 'backlog/1.0.0-master', DETAIL, null); // id 2
insert.run('b100-am-ui', 'project', 'notes/ordinary', DETAIL, null); // id 3
insert.run('other-project', 'project', 'notes/ordinary', 'Unrelated record in another project with enough words.', null); // id 4
insert.run('b100-am-ui', 'project', 'notes/deleted', DETAIL, '2026-01-01'); // id 5 (soft-deleted)
insert.run('b100-am-ui', 'project', 'notes/twin', DETAIL, null); // id 6
insert.run('other-project', 'project', 'notes/twin', DETAIL, null); // id 7
insert.run('b100-am-ui', 'project', 'backlog/9.9.9-master', DETAIL, null); // id 8
insert.run('other-project', 'project', 'backlog/9.9.9-master', DETAIL, null); // id 9
insert.run('b100-am-ui', 'personal', 'notes/ordinary', 'A personal-scope record with its own enough words.', null); // id 10
const TWO_BULLETS = '- #36 table editor: error state is not announced to screen readers under the zoneless scheduler.\n- #37 date-range: endpoint inputs ignore parent control events when disabled.';

insert.run('b100-am-ui', 'project', 'backlog/1.0.0-master-archive-1', DETAIL, null); // id 11: archive holding everything
insert.run('b100-am-ui', 'project', 'backlog/1.0.0-master-archive-2', TWO_BULLETS, null); // id 12: archive holding only #36 and #37
insert.run('b100-am-ui', 'project', 'notes/other-archive-1', DETAIL, null); // id 13: an archive of ANOTHER topic_key
insert.run('other-project', 'project', 'backlog/1.0.0-master-archive-3', DETAIL, null); // id 14: right topic_key, ANOTHER project
insert.run('b100-am-ui', 'project', 'backlog/1.0.0-master-archive-4', DETAIL, '2026-01-01'); // id 15: soft-deleted archive
insert.run('b100-am-ui', 'project', 'notes/ordinary-archive-1', DETAIL, null); // id 16: archive of the ordinary record
insert.run('b100-am-ui', 'project', 'backlog/1.0.0-master-archive-5', '- #36 table editor: error state is not announced to screen readers under the zoneless scheduler.', null); // id 17: holds only #36
insert.run('b100-am-ui', 'project', 'BACKLOG/1.0.0-MASTER-ARCHIVE-6', DETAIL, null); // id 18: archive whose key differs only in case
db.close();

const OPTIONS = { databasePath };
const MISSING = { databasePath: path.join(scratch, 'does-not-exist.db') };
const MCP = 'mcp__plugin_engram_engram__';

function save(input, extra = {}, tool = `${MCP}mem_save`) {
  return { tool_name: tool, cwd: 'C:\\Users\\x\\Projects\\b100-am-ui', tool_input: { title: 't', project: 'b100-am-ui', ...input }, ...extra };
}

function update(input, tool = `${MCP}mem_update`) {
  return { tool_name: tool, tool_input: input };
}

function verdict(payload, options = OPTIONS) {
  return evaluate(JSON.stringify(payload), options)?.hookSpecificOutput?.permissionDecision ?? 'allow';
}

const KEY = 'backlog/1.0.0-bilingual-gate-hardening';

// ── the comparison unit ──────────────────────────────────────────────────────────────────────────────
check('identical content is allowed', verdict(save({ topic_key: KEY, content: DETAIL })), 'allow');
check('a pure addition is allowed', verdict(save({ topic_key: KEY, content: `${DETAIL}\n- #38 a brand new finding with its own measured detail.` })), 'allow');
check('an addition at the top is allowed', verdict(save({ topic_key: KEY, content: `- #38 a brand new finding with its own measured detail.\n${DETAIL}` })), 'allow');

const reordered = [...DETAIL.split('\n')].reverse().join('\n');

check('reordering the lines is allowed', verdict(save({ topic_key: KEY, content: reordered })), 'allow');

const reflowed = DETAIL.replace('The rollout plan keeps every gate green before landing and never batches', 'The rollout plan keeps every gate green\nbefore landing and never\n  batches').replace('hide regressions.', 'hide\nregressions.');

check('reflowing a paragraph is allowed', verdict(save({ topic_key: KEY, content: reflowed })), 'allow');
check('the reflow fixture really changed the lines', reflowed !== DETAIL, true);
check('a bullet re-marked with another marker is allowed', verdict(save({ topic_key: KEY, content: DETAIL.split('- #36').join('* #36') })), 'allow');
check('whitespace and case changes are allowed', verdict(save({ topic_key: KEY, content: DETAIL.split(' ').join('   ').replace('## Open findings', '## OPEN FINDINGS') })), 'allow');
check('CRLF line endings are allowed', verdict(save({ topic_key: KEY, content: DETAIL.split('\n').join('\r\n') })), 'allow');

const withoutBullet = DETAIL.split('\n').filter((line) => !line.startsWith('- #36')).join('\n');

check('deleting one bullet is DENIED', verdict(save({ topic_key: KEY, content: withoutBullet })), 'deny');
check('replacing the detail with a one-line summary is DENIED', verdict(save({ topic_key: KEY, content: 'Update: findings 35 to 37 are being worked on.' })), 'deny');
check('emptying the content is DENIED', verdict(save({ topic_key: KEY, content: '' })), 'deny');
check('editing a bullet in the middle is DENIED', verdict(save({ topic_key: KEY, content: DETAIL.replace('spy evidence in form.spec.ts', 'spy evidence elsewhere') })), 'deny');
check('dropping a numbered entry is DENIED', verdict(save({ topic_key: KEY, content: DETAIL.replace('2. Run the full unit suite before every fast-forward.', '') })), 'deny');

// ── the closure marker ───────────────────────────────────────────────────────────────────────────────
const ANCHOR_36 = '#36 table editor: error state is not announced';

check('a closure line naming the dropped item is allowed (CLOSED)', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- CLOSED: ${ANCHOR_36} — fixed in 5a91cb7d.` })), 'allow');
check('a closure line naming the dropped item is allowed (CERRADO)', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- CERRADO: ${ANCHOR_36} — arreglado.` })), 'allow');
check('a closure line naming the dropped item is allowed (SUPERSEDED)', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- [superseded] ${ANCHOR_36} by #40.` })), 'allow');
check('a closure line naming the dropped item is allowed (SUPERSEDIDO)', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- SUPERSEDIDO ${ANCHOR_36} por #40.` })), 'allow');
check('a feminine closure word is allowed (cerrada)', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- Cerrada: ${ANCHOR_36}.` })), 'allow');
check('a stray CLOSED word that names nothing is DENIED', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- CLOSED: the week is over.` })), 'deny');
check('a blanket "everything closed" line is DENIED', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- CLOSED: all of the items above.` })), 'deny');
check('a closure line naming a DIFFERENT item does not excuse this one', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- CLOSED: #37 date-range: endpoint inputs ignore parent control events.` })), 'deny');
check('the anchor without a closure word is DENIED', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- Still discussing ${ANCHOR_36}.` })), 'deny');
check('a closure word inside a longer word does not count', verdict(save({ topic_key: KEY, content: `${withoutBullet}\n- Unclosed ${ANCHOR_36}.` })), 'deny');

const twoDropped = DETAIL.split('\n').filter((line) => !line.startsWith('- #36') && !line.startsWith('- #37')).join('\n');

check('closing only ONE of two dropped items is DENIED', verdict(save({ topic_key: KEY, content: `${twoDropped}\n- CLOSED: ${ANCHOR_36}.` })), 'deny');
check('closing BOTH dropped items is allowed', verdict(save({ topic_key: KEY, content: `${twoDropped}\n- CLOSED: ${ANCHOR_36}.\n- CLOSED: #37 date-range: endpoint inputs ignore parent control events.` })), 'allow');

// ── the target ───────────────────────────────────────────────────────────────────────────────────────
check('a first save (key absent from the store) is allowed', verdict(save({ topic_key: 'backlog/new-key', content: 'short' })), 'allow');
check('a save without a topic_key is allowed', verdict(save({ content: 'short' })), 'allow');
check('a save without content is allowed', verdict(save({ topic_key: KEY })), 'allow');
check('a soft-deleted row is not a target', verdict(save({ topic_key: 'notes/deleted', content: 'short' })), 'allow');
check('the same key in ANOTHER project is a first save there', verdict(save({ topic_key: 'notes/ordinary', project: 'yet-another', content: 'short' })), 'allow');
check('the topic_key match is case-insensitive', verdict(save({ topic_key: KEY.toUpperCase(), content: 'Update: short.' })), 'deny');
check('a personal-scope addition is allowed', verdict(save({ topic_key: 'notes/ordinary', scope: 'personal', content: 'A personal-scope record with its own enough words. Plus more words added.' })), 'allow');
check('a project-scope save is judged against the project row, not the personal one', verdict(save({ topic_key: 'notes/ordinary', content: DETAIL })), 'allow');
check('the personal-scope row is protected in its own scope', verdict(save({ topic_key: 'notes/ordinary', scope: 'personal', content: 'short' })), 'deny');
check('an ordinary key is protected as well', verdict(save({ topic_key: 'notes/ordinary', content: 'short' })), 'deny');
check('the master topic_key is protected', verdict(save({ topic_key: 'backlog/1.0.0-master', content: 'short' })), 'deny');
check('several rows narrowed by the named project are judged', verdict(save({ topic_key: 'notes/twin', project: 'b100-am-ui', content: 'short' })), 'deny');
check('several rows narrowed by the working directory are judged', verdict(save({ topic_key: 'notes/twin', project: undefined, content: 'short' })), 'deny');
check('several rows narrowed by the working directory, addition allowed', verdict(save({ topic_key: 'notes/twin', project: undefined, content: `${DETAIL}\n- one more addition with words.` })), 'allow');
check('several rows that cannot be narrowed: ordinary key fails OPEN', verdict(save({ topic_key: 'notes/twin', project: undefined, content: 'short' }, { cwd: 'C:\\somewhere\\else' })), 'allow');
check('several rows that cannot be narrowed: master key fails CLOSED', verdict(save({ topic_key: 'backlog/9.9.9-master', project: undefined, content: 'short' }, { cwd: 'C:\\somewhere\\else' })), 'deny');

// ── update by id ─────────────────────────────────────────────────────────────────────────────────────
check('update by id dropping content is DENIED', verdict(update({ id: 1, content: 'Update: short.' })), 'deny');
check('update by id adding content is allowed', verdict(update({ id: 1, content: `${DETAIL}\n- an addition with words.` })), 'allow');
check('update by id closing the dropped item is allowed', verdict(update({ id: 1, content: `${withoutBullet}\n- CLOSED: ${ANCHOR_36}.` })), 'allow');
check('update without content (title only) is allowed', verdict(update({ id: 1, title: 'new title' })), 'allow');
check('update of an unknown id is allowed', verdict(update({ id: 9999, content: 'short' })), 'allow');
check('update of a soft-deleted id is allowed', verdict(update({ id: 5, content: 'short' })), 'allow');
check('update without an id is allowed', verdict(update({ content: 'short' })), 'allow');
check('update on the master row is DENIED for a loss', verdict(update({ id: 2, content: 'short' })), 'deny');

// ── both engram mounts ───────────────────────────────────────────────────────────────────────────────
check('the plain mount mem_save is guarded', verdict(save({ topic_key: KEY, content: 'short' }, {}, 'mcp__engram__mem_save')), 'deny');
check('the plain mount mem_update is guarded', verdict(update({ id: 1, content: 'short' }, 'mcp__engram__mem_update')), 'deny');

// ── the store ────────────────────────────────────────────────────────────────────────────────────────
check('an unreadable store fails CLOSED for a master key', verdict(save({ topic_key: 'backlog/1.0.0-master', content: 'short' }), MISSING), 'deny');
check('an unreadable store fails OPEN for an ordinary key', verdict(save({ topic_key: 'notes/ordinary', content: 'short' }), MISSING), 'allow');
check('an unreadable store fails open for update by id', verdict(update({ id: 1, content: 'short' }), MISSING), 'allow');

// ── refusal text ─────────────────────────────────────────────────────────────────────────────────────
const refusalText = evaluate(JSON.stringify(save({ topic_key: KEY, content: withoutBullet })), OPTIONS)?.hookSpecificOutput?.permissionDecisionReason ?? '';

check('the refusal names the dropped line', refusalText.includes('#36 table editor'), true);
check('the refusal defines the marker in English', refusalText.includes('closure word'), true);
check('the refusal mirrors in Spanish with @es', refusalText.includes('@es') && refusalText.includes('palabra de cierre'), true);

check('a closure line naming only the first word of the item does not excuse it', verdict(save({ topic_key: KEY, content: `${withoutBullet}
- CLOSED: #36 was discussed.` })), 'deny');
check('tabs and non-breaking spaces count as whitespace', verdict(save({ topic_key: KEY, content: DETAIL.split(' ').join('	').split('#36').join('#36 ') })), 'allow');

// decide() driven directly with readers that refuse to be called: a call means the guard judged what it must not.
const FORBIDDEN = { byId: () => { throw new Error('store read'); }, byTopicKey: () => { throw new Error('store read'); } };
check('a save without a topic_key never reads the store', decide({}, `${MCP}mem_save`, { content: 'short' }, FORBIDDEN), undefined);
check('a save with a blank topic_key never reads the store', decide({}, `${MCP}mem_save`, { topic_key: '  ', content: 'short' }, FORBIDDEN), undefined);
check('an update without content never reads the store', decide({}, `${MCP}mem_update`, { id: 1, title: 'x' }, FORBIDDEN), undefined);
check('an unrelated tool never reads the store', decide({}, 'Bash', { command: 'ls' }, FORBIDDEN), undefined);

// ── the pure units ───────────────────────────────────────────────────────────────────────────────────
check('a wrapped paragraph is ONE item', extractItems('one two three\nfour five six\n\nseven eight').length, 2);
check('bullets, numbers, headings and table rows each start an item', extractItems('- a b\n* c d\n3. e f\n## g h\n| i | j |').length, 5);
check('a single-word bullet drop is ignored', droppedItems('- ok', 'different words entirely').length, 0);
check('a two-word bullet drop is reported', droppedItems('- two words', 'different words entirely').length, 1);

// ── this guard's own malfunctions fail open ─────────────────────────────────────────────────────────
check('bad JSON is allowed', evaluate('{not json', OPTIONS) === undefined, true);
check('an unrelated tool is allowed', verdict({ tool_name: 'Bash', tool_input: { command: 'ls' } }), 'allow');
check('a null tool_input is allowed', verdict({ tool_name: `${MCP}mem_save`, tool_input: null }), 'allow');
check('mem_delete is not this guard\'s concern', verdict({ tool_name: `${MCP}mem_delete`, tool_input: { id: 1 } }), 'allow');

// ── today's incident, in the payload shape captured from the real call ──────────────────────────────
const INCIDENT = {
  session_id: 'a',
  cwd: 'C:\\Users\\adrian.jimenez\\Desktop\\Projects\\b100-am-ui',
  hook_event_name: 'PreToolUse',
  tool_name: 'mcp__plugin_engram_engram__mem_save',
  tool_input: { title: 'Backlog update', type: 'decision', topic_key: KEY, content: 'Update 2026-10-01: the gate hardening items were worked on and landed.' }
};

check('the real incident payload shape is denied end to end', verdict(INCIDENT), 'deny');

// ── archive acceptance (`ARCHIVED: #<id>`) ───────────────────────────────────────────────────────────
const MASTER = 'backlog/1.0.0-master';
const SHRUNK = '- #38 a brand new finding with its own measured detail.';
const archived = (...ids) => `${SHRUNK}\nARCHIVED: ${ids.map((id) => `#${id}`).join(', ')}`;
const archiveDecision = (input, tool) => evaluate(JSON.stringify(tool === 'update' ? update(input) : save(input)), OPTIONS)?.hookSpecificOutput?.permissionDecisionReason ?? '';

check('no ARCHIVED line: a shrinking master is still DENIED', verdict(save({ topic_key: MASTER, content: SHRUNK })), 'deny');
check('items verbatim in a cited archive: master save allowed', verdict(save({ topic_key: MASTER, content: archived(11) })), 'allow');
check('items verbatim in a cited archive: update by id allowed', verdict(update({ id: 2, content: archived(11) })), 'allow');
check('two archives that together hold every item are allowed', verdict(save({ topic_key: MASTER, content: `${SHRUNK}\nARCHIVED: #12\nARCHIVED: #17\n- Remaining detail kept here: the rollout plan keeps every gate green before landing and never batches fixes into a single large diff, because batched fixes hide regressions.\n- #35 forms finding: file src/forms/form.ts, spy evidence in form.spec.ts, markForCheck sites at three places.\n## Open findings\n1. Regenerate the goldens deliberately with api:update.\n2. Run the full unit suite before every fast-forward.` })), 'allow');
check('an ARCHIVED line with a bullet and lowercase label is parsed', verdict(save({ topic_key: MASTER, content: `${SHRUNK}\n- archived: #11` })), 'allow');
check('an item missing from the cited archive is DENIED', verdict(save({ topic_key: MASTER, content: archived(17) })), 'deny');

const missingText = archiveDecision({ topic_key: MASTER, content: archived(17) });

check('the refusal names the item the archive lacks', missingText.includes('#37 date-range'), true);
check('the refusal does not name an item the archive holds', missingText.includes('#36 table editor'), false);
check('the archive guidance is bilingual', missingText.includes('ARCHIVED: #<archive id>') && missingText.includes('registro archivo'), true);
check('an unreadable archive id is DENIED', verdict(save({ topic_key: MASTER, content: archived(9999) })), 'deny');
check('a soft-deleted archive is DENIED', verdict(save({ topic_key: MASTER, content: archived(15) })), 'deny');
check('an archive of ANOTHER topic_key is DENIED', verdict(save({ topic_key: MASTER, content: archived(13) })), 'deny');
check('the target itself is not an archive of itself', verdict(save({ topic_key: MASTER, content: archived(2) })), 'deny');
check('an archive with the right topic_key in ANOTHER project is DENIED', verdict(save({ topic_key: MASTER, content: archived(14) })), 'deny');
check('one valid archive does not excuse a second, invalid citation', verdict(save({ topic_key: MASTER, content: archived(11, 13) })), 'deny');
check('an unusable archive is refused even when the store is fine otherwise', archiveDecision({ topic_key: MASTER, content: archived(13) }).includes('not an archive of backlog/1.0.0-master'), true);
check('the archive label must START the line: a mention elsewhere cites nothing', verdict(save({ topic_key: MASTER, content: `${SHRUNK}\nsee ARCHIVED: #11 for the rest` })), 'deny');
check('a non-numeric id cites nothing', verdict(save({ topic_key: MASTER, content: `${SHRUNK}\nARCHIVED: #eleven` })), 'deny');
check('an unreadable store with an ARCHIVED line still fails CLOSED for the master', verdict(save({ topic_key: MASTER, content: archived(11) }), MISSING), 'deny');
check('an ordinary record uses its own archive', verdict(update({ id: 3, content: `${SHRUNK}\nARCHIVED: #16` })), 'allow');
check('an ordinary record may not cite the master archive', verdict(update({ id: 3, content: `${SHRUNK}\nARCHIVED: #11` })), 'deny');
const realReaders = { byId: (id) => readRevisionById(id, OPTIONS), byTopicKey: (topicKey, filters) => readRevisionsByTopicKey(topicKey, filters, OPTIONS) };
const unreadableArchive = { ...realReaders, byId: (id) => (id === 11 ? { error: 'query-failed', detail: 'boom' } : readRevisionById(id, OPTIONS)) };
const absentArchive = { ...realReaders, byId: (id) => (id === 11 ? { rows: [] } : readRevisionById(id, OPTIONS)) };

check('nothing dropped: a bad citation is not even resolved', decide({}, `${MCP}mem_save`, { topic_key: KEY, content: `${DETAIL}\nARCHIVED: #9999` }, { ...realReaders, byId: (id) => (id === 9999 ? { error: 'resolved' } : realReaders.byId(id)) }), undefined);
check('a cited archive whose read errors is an archive-invalid refusal', decide({}, `${MCP}mem_save`, { topic_key: MASTER, project: 'b100-am-ui', content: archived(11) }, unreadableArchive)?.kind, 'archive-invalid');
check('a cited archive that reads as absent is an archive-invalid refusal', decide({}, `${MCP}mem_save`, { topic_key: MASTER, project: 'b100-am-ui', content: archived(11) }, absentArchive)?.kind, 'archive-invalid');
check('an unreadable citation beside a valid one is DENIED', verdict(save({ topic_key: MASTER, content: archived(9999, 11) })), 'deny');
check('a soft-deleted citation beside a valid one is DENIED', verdict(save({ topic_key: MASTER, content: archived(15, 11) })), 'deny');
check('the archive topic_key prefix match ignores case', verdict(save({ topic_key: MASTER, content: archived(18) })), 'allow');
check('a junk token beside a valid id is ignored, the valid id still counts', verdict(save({ topic_key: MASTER, content: `${SHRUNK}\nARCHIVED: #11, #eleven` })), 'allow');
check('citedArchiveIds reads several ids and ignores repeats', citedArchiveIds('ARCHIVED: #3, #4 #3\n- ARCHIVED: (#5)').join(','), '3,4,5');

if (failures.length > 0) {
  console.error(`backlog-content-guard selftest: ${failures.length} FAILURE(S) of ${passed + failures.length}`);

  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`backlog-content-guard selftest: ${passed}/${passed} passed`);
