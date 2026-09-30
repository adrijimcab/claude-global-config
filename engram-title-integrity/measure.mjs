// Measure untitled observations in the live engram store. READ-ONLY.
// M5: zero regex. Structural checks only.
import { DatabaseSync } from 'node:sqlite';

const DB = 'C:/Users/adrian.jimenez/.engram/engram.db';
const db = new DatabaseSync(DB, { readOnly: true });

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

// Structural emptiness: trim without regex.
const WS = [' ', '\t', '\n', '\r', '\v', '\f', '\u00a0', '\u2028', '\u2029', '\ufeff'];
const isBlank = (s) => {
  if (s === null || s === undefined) return true;
  if (typeof s !== 'string') return false;
  for (const ch of s) if (!WS.includes(ch)) return false;
  return true;
};

console.log('DB:', DB);
console.log('total observations (all projects, incl deleted):', one('SELECT COUNT(*) c FROM observations').c);
console.log('total observations (all projects, live):       ', one('SELECT COUNT(*) c FROM observations WHERE deleted_at IS NULL').c);
console.log('title IS NULL (schema says NOT NULL):          ', one('SELECT COUNT(*) c FROM observations WHERE title IS NULL').c);

const rows = all("SELECT id, title, project, scope, type, session_id, topic_key, created_at, deleted_at, substr(content,1,120) AS head FROM observations ORDER BY id");
const blanks = rows.filter((r) => isBlank(r.title));
const live = blanks.filter((r) => r.deleted_at === null);

console.log('');
console.log('=== BLANK-TITLE (empty or whitespace-only), structural scan of all rows ===');
console.log('blank incl. deleted:', blanks.length);
console.log('blank and live:     ', live.length);

const byProject = new Map();
for (const r of live) byProject.set(r.project, (byProject.get(r.project) ?? 0) + 1);
console.log('live blanks by project:', JSON.stringify([...byProject].sort((a, b) => b[1] - a[1])));

const byType = new Map();
for (const r of live) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
console.log('live blanks by type:   ', JSON.stringify([...byType].sort((a, b) => b[1] - a[1])));

// Exactly-empty vs whitespace-only, to expose the near-miss class.
const exactlyEmpty = live.filter((r) => r.title === '').length;
console.log('of live blanks: title === "" :', exactlyEmpty, '| whitespace-only:', live.length - exactlyEmpty);

if (live.length > 0) {
  const dates = live.map((r) => r.created_at).sort();
  console.log('live blank created_at range:', dates[0], '->', dates[dates.length - 1]);
  console.log('id range:', live[0].id, '->', live[live.length - 1].id);
  console.log('');
  console.log('=== first 5 live blanks ===');
  for (const r of live.slice(0, 5)) console.log(JSON.stringify(r));
  console.log('=== last 5 live blanks ===');
  for (const r of live.slice(-5)) console.log(JSON.stringify(r));
}

// Distribution over time, to answer historical-vs-ongoing.
console.log('');
console.log('=== live blanks per month ===');
const byMonth = new Map();
for (const r of live) {
  const m = String(r.created_at).slice(0, 7);
  byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
}
for (const [m, c] of [...byMonth].sort()) console.log(' ', m, c);

console.log('');
console.log('=== ALL live observations per month (denominator) ===');
const totMonth = new Map();
for (const r of rows.filter((x) => x.deleted_at === null)) {
  const m = String(r.created_at).slice(0, 7);
  totMonth.set(m, (totMonth.get(m) ?? 0) + 1);
}
for (const [m, c] of [...totMonth].sort()) console.log(' ', m, c, 'blank=' + (byMonth.get(m) ?? 0));

db.close();
