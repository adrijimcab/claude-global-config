#!/usr/bin/env node
/**
 * Self-test for the shared-resources declaration reader and schema.
 *
 * THE STATE SPACE: no file (absent); a file that is not JSON; a JSON that is not an object; a wrong
 * `schemaVersion`; an unknown key at the top and in a resource (a misspelt key must be a problem, never
 * "absent"); an empty or missing `resources`; every field wrong in turn (name, description, home, ports,
 * startCommands, processNames, reconfiguredBy); a resource that identifies nothing; a duplicate name; a
 * valid file with a BOM; a valid file whose `home` is relative (resolved against the project root) and one
 * whose `home` is absolute.
 *
 * @es Auto-test del lector y esquema de la declaración de recursos compartidos. Estados: sin fichero, no
 * JSON, no objeto, versión errónea, claves desconocidas (arriba y en un recurso), `resources` vacío, cada
 * campo erróneo, recurso que no identifica nada, nombre duplicado, BOM, `home` relativa y absoluta.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { declarationProblems, readDeclaration, SHARED_RESOURCES_FILE } from './declaration.mjs';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}\n`);
  }
}

const GOOD = { name: 'local-prod', description: 'shared local PROD', ports: [3100], startCommands: [['node', 'bin/www']], processNames: ['nodemon'], reconfiguredBy: ['FRT_URL'] };
const file = (resources, extra = {}) => ({ schemaVersion: 1, resources, ...extra });
const problemsOf = (declaration) => declarationProblems(declaration).join(' | ');
const mentions = (declaration, text) => problemsOf(declaration).includes(text);

check('a valid declaration has no problems', declarationProblems(file([GOOD])).length === 0, problemsOf(file([GOOD])));
check('a resource with only one identifying field is valid', declarationProblems(file([{ name: 'a', description: 'd', ports: [1] }])).length === 0);

check('not an object', declarationProblems([]).length === 1 && declarationProblems(null).length === 1);
check('wrong schemaVersion', mentions({ ...file([GOOD]), schemaVersion: 2 }, 'schemaVersion'));
check('missing schemaVersion', mentions({ resources: [GOOD] }, 'schemaVersion'));
check('unknown top-level key is a problem, not "absent"', mentions(file([GOOD], { resourcez: [] }), 'unknown key "resourcez"'));
check('unknown resource key is a problem', mentions(file([{ ...GOOD, portz: [1] }]), 'unknown key "portz"'));
check('empty resources', mentions(file([]), 'resources: must be a non-empty list'));
check('resources not a list', mentions({ schemaVersion: 1, resources: {} }, 'resources: must be a non-empty list'));
check('a resource that is not an object', mentions(file(['x']), 'resources[0]: must be an object'));
check('name must be lower-case words', mentions(file([{ ...GOOD, name: 'Local Prod' }]), '.name:'));
check('name must not start with a dash', mentions(file([{ ...GOOD, name: '-a' }]), '.name:'));
check('name is required', mentions(file([{ ...GOOD, name: undefined }]), '.name: must be a non-empty string'));
check('description is required', mentions(file([{ ...GOOD, description: ' ' }]), '.description'));
check('home must be text when present', mentions(file([{ ...GOOD, home: 3 }]), '.home'));
check('ports must be integers in range', mentions(file([{ ...GOOD, ports: [0] }]), '.ports') && mentions(file([{ ...GOOD, ports: [70000] }]), '.ports') && mentions(file([{ ...GOOD, ports: ['3100'] }]), '.ports') && mentions(file([{ ...GOOD, ports: [] }]), '.ports'));
check('startCommands must be word lists', mentions(file([{ ...GOOD, startCommands: [[]] }]), '.startCommands') && mentions(file([{ ...GOOD, startCommands: ['node'] }]), '.startCommands') && mentions(file([{ ...GOOD, startCommands: [] }]), '.startCommands'));
check('processNames must be a non-empty text list', mentions(file([{ ...GOOD, processNames: [] }]), '.processNames') && mentions(file([{ ...GOOD, processNames: [1] }]), '.processNames'));
check('reconfiguredBy must be environment names', mentions(file([{ ...GOOD, reconfiguredBy: ['FRT-URL'] }]), '.reconfiguredBy') && mentions(file([{ ...GOOD, reconfiguredBy: ['1X'] }]), '.reconfiguredBy') && mentions(file([{ ...GOOD, reconfiguredBy: [] }]), '.reconfiguredBy'));
check('a resource that identifies nothing', mentions(file([{ name: 'a', description: 'd' }]), 'identifies no control action'));
check('duplicate names', mentions(file([GOOD, GOOD]), 'declared twice'));
check('every problem is reported at once', declarationProblems(file([{ name: 'A', description: '', ports: [0] }], { extra: 1 })).length >= 4);

// --- THE READER, on constructed project directories ----------------------------------------------
const root = mkdtempSync(path.join(os.tmpdir(), 'shared-resources-'));

function project(name, content) {
  const dir = path.join(root, name);

  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  if (content !== undefined) writeFileSync(path.join(dir, SHARED_RESOURCES_FILE), content);

  return dir;
}

try {
  check('no file: absent', readDeclaration(project('none')).status === 'absent');

  const notJson = readDeclaration(project('broken', '{nope'));

  check('not JSON: invalid with the parse reason', notJson.status === 'invalid' && notJson.problems[0].includes('cannot be read as JSON'));

  const schemaBroken = readDeclaration(project('schema', JSON.stringify(file([{ ...GOOD, portz: 1 }]))));

  check('schema problems: invalid, file named, problems listed', schemaBroken.status === 'invalid' && schemaBroken.file.endsWith('shared-resources.json') && schemaBroken.problems.length >= 1);

  const withBom = readDeclaration(project('bom', `﻿${JSON.stringify(file([GOOD]))}`));

  check('a BOM-prefixed valid file is valid', withBom.status === 'valid' && withBom.resources[0].name === 'local-prod');

  const relative = readDeclaration(project('relative', JSON.stringify(file([{ ...GOOD, home: 'app/sources' }]))));

  check('a relative home resolves against the project root', relative.status === 'valid' && relative.resources[0].home === path.resolve(root, 'relative', 'app/sources'));

  const absoluteHome = path.resolve(root, 'elsewhere');
  const absolute = readDeclaration(project('absolute', JSON.stringify(file([{ ...GOOD, home: absoluteHome.split(path.sep).join('/') }]))));

  check('an absolute home is kept', absolute.status === 'valid' && absolute.resources[0].home === absoluteHome);
  check('a resource without home keeps it undefined', readDeclaration(project('nohome', JSON.stringify(file([GOOD])))).resources[0].home === undefined);
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
