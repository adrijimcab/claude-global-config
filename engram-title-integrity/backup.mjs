// Consistent online backup of the live engram store (WAL-safe, via SQLite backup API).
import { DatabaseSync, backup } from 'node:sqlite';

const src = process.argv[2];
const dst = process.argv[3];
if (!src || !dst) {
  console.error('usage: node backup.mjs <src.db> <dst.db>');
  process.exit(2);
}
const db = new DatabaseSync(src, { readOnly: true });
const n = await backup(db, dst);
db.close();
console.log('backed up', src, '->', dst, '| pages:', n);
