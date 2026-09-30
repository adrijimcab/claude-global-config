import { statSync } from 'node:fs';
import { projectSlug, significantWords, priorAgents } from './guard.mjs';
import { agentRecords } from '../agent-liveness/liveness.mjs';

const repo = 'C:\\Users\\adrian.jimenez\\Desktop\\Projects\\b100-am-ui';
const slug = projectSlug(repo);
const records = agentRecords();

console.log('slug computed :', slug);
console.log('slugs in store:', [...new Set(records.map((r) => r.project))].join(' | '));
console.log('records in this project:', records.filter((r) => r.project === slug).length);

const target = records.filter((r) => r.description === 'Re-measure coverage floors');

console.log('records with that exact description:', target.length);

for (const record of target) {
  let age = 'TRANSCRIPT MISSING';

  try {
    age = `${Math.round((Date.now() - statSync(record.transcript).mtimeMs) / 60000)} min old`;
  } catch { /* reported as missing */ }

  console.log(`  ${record.id}  project=${record.project}  ${age}`);
}

console.log('wanted words:', [...significantWords('Re-measure coverage floors')].join(' '));
console.log('priorAgents says:', priorAgents('Re-measure coverage floors', repo, records, Date.now()).length, 'match(es)');
