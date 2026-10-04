#!/usr/bin/env node
/**
 * Discrimination proof of how `faces.mjs` counts the FACES a promoted text names for a key. The decisions
 * it ranges over, each with a near miss: repeating the key inside one paragraph is still ONE face; each
 * list item that names the key is a face; the sub-bullets of an item that names the key are its faces even
 * when they do not repeat the key (the shape of `rules/promoted-rules.md`); a sub-bullet under an item
 * that does NOT name the key is not; the details nested under a face are not faces; an item that names
 * ANOTHER key is not; a plain paragraph naming the key is a face; ordered items count like bullets.
 *
 * @es Prueba de discriminación de cómo `faces.mjs` cuenta las CARAS que un texto promovido nombra para una
 * clave. Repetir la clave dentro de un párrafo sigue siendo UNA cara; cada elemento de lista que nombra la
 * clave es una cara; los sub-puntos de un elemento que la nombra son sus caras aunque no repitan la clave
 * (la forma de `rules/promoted-rules.md`); un sub-punto bajo un elemento que NO la nombra no lo es; los
 * detalles anidados bajo una cara no son caras; un elemento de OTRA clave no cuenta; un párrafo suelto que
 * nombra la clave es una cara; los elementos ordenados cuentan como los de viñeta.
 */

import { countFaces } from './faces.mjs';

const KEY = 'some-key';
let passed = 0;
const failures = [];
const equal = (name, actual, expected) => (JSON.stringify(actual) === JSON.stringify(expected) ? (passed += 1) : failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));

equal('no text, no faces', countFaces('', KEY), 0);
equal('a text that never names the key has no faces', countFaces('- **`other-key`** — rule.\n  - a sub face\n', KEY), 0);
equal('one item naming the key is one face', countFaces(`- **\`${KEY}\`** — the rule.\n`, KEY), 1);
equal('NEAR MISS: the key repeated five times inside ONE item is still one face', countFaces(`- **\`${KEY}\`** — ${KEY} ${KEY} ${KEY} ${KEY}.\n`, KEY), 1);
equal('NEAR MISS: the key repeated across the continuation lines of ONE item is one face', countFaces(`- **\`${KEY}\`** — first line\n  continues with ${KEY}\n  and ${KEY} again.\n`, KEY), 1);
equal('two separate items naming the key are two faces', countFaces(`- (\`${KEY}\`) first face.\n- (\`${KEY}\`) second face.\n`, KEY), 2);
equal('the sub-bullets of an item naming the key are faces even without the key', countFaces(`- **\`${KEY}\`** — the rule.\n  - **A.** RULE: one.\n  - **B.** RULE: two.\n`, KEY), 3);
equal('NEAR MISS: sub-bullets under an item that does NOT name the key are not faces', countFaces(`- **\`other-key\`** — rule.\n  - **A.** RULE: one.\n  - **B** names ${KEY}.\n`, KEY), 1);
equal('the details nested under a face are not faces', countFaces(`- **\`${KEY}\`** — the rule.\n  - **A.** RULE: one.\n    - a detail of A.\n    - another detail of A.\n`, KEY), 2);
equal('a sub-bullet that names the key itself makes its own details faces', countFaces(`- **\`other-key\`** — rule.\n  - **B** (\`${KEY}\`).\n    - a detail.\n`, KEY), 2);
equal('a continuation after a blank line, indented, stays in its item', countFaces(`- **\`${KEY}\`** — the rule.\n\n  more of the same item, ${KEY}.\n`, KEY), 1);
equal('a plain paragraph naming the key is a face', countFaces(`# Title\n\nA paragraph about ${KEY} that stands alone.\n`, KEY), 1);
equal('a plain paragraph after a list ends the list context', countFaces(`- **\`${KEY}\`** — the rule.\n  - **A.** one.\n\nUnrelated paragraph.\n\n  - an orphan item.\n`, KEY), 2);
equal('ordered items count like bullets', countFaces(`1. (\`${KEY}\`) first.\n2. (\`${KEY}\`) second.\n10. nothing here.\n`, KEY), 2);
equal('a key that is only a prefix of another key is not named', countFaces(`- **\`${KEY}-extended\`** — a different rule.\n`, KEY), 0);
equal('a key that is only a suffix of another key is not named', countFaces(`- **\`prefix-${KEY}\`** — a different rule.\n`, KEY), 0);

console.log(`faces selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
