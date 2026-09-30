#!/usr/bin/env node
/**
 * WHY THIS GUARD ASKS THE QUESTION IT ASKS, AND NOT THE ONE IT WAS ASKED FOR — measured, on real briefs.
 *
 * The task that produced `brief-tenancy` asked for a guard that REFUSES A DELEGATION WHOSE TEXT
 * AUTHORISES A PROHIBITED COMMAND, and named the four states it had to tell apart:
 *
 *   REFUSE  "they have their own independent trees, so `npm ci` is exactly the command you want,
 *            run it there freely"                                        — an authorisation on a premise
 *   ALLOW   "NEVER run `npm ci` on this machine"                         — the prohibition itself
 *   ALLOW   a brief that documents the prohibition or quotes a refusal   — writing about the rule
 *   ALLOW   `docker run node:22-alpine sh -c "npm ci"`                   — the legitimate container form
 *
 * The first two carry the IDENTICAL command span. Nothing separates them but the polarity of the prose
 * around it, and this file measures what reading that polarity would cost, over the 334 real briefs,
 * resumes and task records in `.claude/brief-provenance-study/` — a corpus collected for a different
 * guard, so it was not selected to make any candidate here look good.
 *
 * RUN IT: `node .claude/brief-tenancy/discriminator-study.mjs`. It writes no files and reads nothing but
 * that corpus and the filesystem's own tenancy.
 *
 * WHAT THE CORPUS CONTAINS, read rather than counted (`audit-verdict-from-commit-subjects-not-from-reading`:
 * a search may only LOCATE candidates). Every text that mentions a package-manager mutation was opened
 * and classified by hand. There are 24, and ALL 24 ARE LEGITIMATE — 12 are the prohibition itself (11 of
 * them the standard brief preamble, verbatim), 10 describe a mutation as a fact (`so \`npm ci\` exits
 * EUSAGE there`, `the credential must reach ALL THREE \`npm ci\` sites`), and 2 authorise a sanctioned
 * command (`npm install --package-lock-only`). Not one is the hazard. So every refusal any candidate
 * produces on this corpus is a FALSE one, and the counts below are read that way. (A cruder substring
 * probe found 25; the 25th, `resumes/0158`, says "npm installs nothing" — not a command — and the
 * toolchain guard's own parser rightly does not count it.)
 *
 * @es POR QUÉ ESTE GUARD HACE LA PREGUNTA QUE HACE Y NO LA QUE SE LE PIDIÓ — medido sobre briefs reales.
 * Se pidió rechazar el brief que AUTORIZA un comando prohibido, distinguiéndolo de la prohibición, de la
 * documentación y de la forma en contenedor. Los dos primeros llevan el MISMO comando y solo los separa
 * la polaridad de la prosa; este fichero mide lo que costaría leer esa polaridad sobre los 334 textos
 * reales del corpus, recogido para otro guard y por tanto no elegido para favorecer a nadie. LOS 24
 * TEXTOS QUE MENCIONAN UNA MUTACIÓN SE ABRIERON Y CLASIFICARON A MANO: los 24 son legítimos, así que
 * todo rechazo sobre este corpus es FALSO.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { refusalFor } from './decision.mjs';
import { mentionedMutations } from './mentioned-mutations.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, '..', 'brief-provenance-study');
const POPULATIONS = ['briefs', 'corpus', 'resumes'];

/**
 * The words with which a brief forbids. Measured from the corpus, not imagined: the 12 real prohibitions
 * spell it `NEVER run`, `NEVER`, and `never npm ci`, and nothing else.
 * @es Las palabras con que un brief prohíbe, medidas del corpus y no imaginadas.
 */
const NEGATIONS = ['never', 'do not', "don't", 'must not', 'no ', 'refuse'];

/** How far before a mention a negation still governs it. One clause, generously read. @es Alcance. */
const NEGATION_REACH = 120;

/**
 * CANDIDATE 1 — refuse on the token. The simplest reading of the request: the brief mentions a command
 * this machine prohibits, so refuse it.
 * @es CANDIDATO 1: rechazar por el token.
 */
const tokenPresent = (text) => mentionedMutations(text).length > 0;

/**
 * CANDIDATE 2 — refuse unless a negation governs the mention. The narrowest honest attempt at polarity:
 * a prohibition says so, an authorisation does not.
 * @es CANDIDATO 2: rechazar salvo que una negación gobierne la mención.
 */
function unnegatedMention(text) {
  const mutations = mentionedMutations(text);

  if (mutations.length === 0) return false;

  const lowered = text.toLowerCase();

  // Each occurrence of the MUTATION itself (`npm install`), never of the bare manager word: counting an
  // unnegated `npm run check:i18n` against this candidate would make it look worse than it is, and the
  // point of this file is a fair comparison. A mutation the parser found but whose literal spelling is
  // not in the text (an alias, a bare `yarn`) is judged unnegated only if no occurrence can be located.
  for (const mutation of mutations) {
    let at = lowered.indexOf(mutation);

    if (at === -1) return true;

    while (at !== -1) {
      const before = lowered.slice(Math.max(0, at - NEGATION_REACH), at);

      if (!NEGATIONS.some((negation) => before.includes(negation))) return true;

      at = lowered.indexOf(mutation, at + 1);
    }
  }

  return false;
}

/**
 * CANDIDATE 3 — refuse unless the brief carries an exemption marker, on the `brief-provenance` model of
 * a literal line scan. It does not judge polarity; it requires the claim to be sourced.
 * @es CANDIDATO 3: rechazar salvo que el brief lleve un marcador de exención.
 */
function unmarkedMention(text) {
  if (mentionedMutations(text).length === 0) return false;

  return !text.split('\n').some((line) => line.trim().startsWith('TOOLCHAIN-EXEMPTION') && line.includes(':'));
}

/** CANDIDATE 4 — what actually shipped. @es CANDIDATO 4: lo que se ha publicado. */
const shipped = (text) => refusalFor(text) !== undefined;

const CANDIDATES = [
  ['1 token present', tokenPresent, 'refuse any brief mentioning a prohibited command'],
  ['2 negation polarity', unnegatedMention, 'refuse a mention no negation governs'],
  ['3 exemption marker', unmarkedMention, 'refuse a mention with no sourced exemption line'],
  ['4 SHIPPED tenancy', shipped, 'refuse a mention beside an undeclared foreign-tenanted checkout']
];

if (!existsSync(CORPUS)) {
  console.log(`corpus absent at ${CORPUS} — nothing measured, and that is reported rather than passed`);
  process.exit(2);
}

const texts = POPULATIONS.flatMap((population) => {
  const directory = join(CORPUS, population);

  if (!existsSync(directory)) return [];

  return readdirSync(directory)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => ({ name: `${population}/${name}`, text: readFileSync(join(directory, name), 'utf8') }));
});

// The incident, verbatim, in the brief that carried it — the one TRUE positive this corpus does not hold.
const INCIDENT = [
  'Fix the two lint plugin repositories so their pipelines install cleanly.',
  '',
  'MEASURED (by me, this session): both repos are on develop with no lockfile tracked.',
  'HYPOTHESIS: the install step has never worked in CI.',
  '',
  '## Constraints',
  '',
  '- NEVER run `npm ci` on this machine: it destroys the junction-shared tree.',
  '- Inside the two PLUGIN repositories, which have their own independent trees, `npm ci` is exactly the command you are trying to make work, so run it there freely.',
  '- The repositories are C:/Users/adrian.jimenez/Desktop/Projects/plugin-eslint and C:/Users/adrian.jimenez/Desktop/Projects/plugin-stylelint.'
].join('\n');

console.log(`corpus: ${texts.length} real briefs, resumes and task records`);
console.log(`of which mention a package-manager mutation: ${texts.filter((entry) => mentionedMutations(entry.text).length > 0).length}`);
console.log('every one of those was opened and read; all are legitimate, so every refusal below is FALSE\n');

const started = Date.now();

for (const [name, decide, what] of CANDIDATES) {
  const refused = texts.filter((entry) => decide(entry.text));
  const catchesIncident = decide(INCIDENT);

  console.log(`CANDIDATE ${name}  — ${what}`);
  console.log(`  false refusals on real traffic : ${refused.length} of ${texts.length}`);
  console.log(`  refuses the real incident      : ${catchesIncident ? 'yes' : 'NO'}`);

  if (refused.length > 0) console.log(`  examples                       : ${refused.slice(0, 4).map((entry) => entry.name).join(', ')}`);

  console.log('');
}

console.log(`measured in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log('');
console.log('THE VERDICT THIS RECORDS. Candidates 1 and 3 refuse the sentence every correct brief contains,');
console.log('including the standard preamble\'s own `NEVER run `npm install``. Candidate 2 still refuses the');
console.log('documentary mentions, which carry no negation because they assert nothing. A control that');
console.log('reddens on correct work is switched off within the hour, so none of the three may ship — and');
console.log('the fourth does not read polarity at all: it asks whether the brief names a tree the machine');
console.log('has MEASURED as somebody else\'s, and whether it says so.');
