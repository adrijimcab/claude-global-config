#!/usr/bin/env node
/**
 * Self-test for company-config: the shipped list, every way the list can be unusable, and the whole-word
 * matcher including its near misses.
 * @es Auto-test: la lista entregada, cada forma de lista inservible y el comparador por palabra completa con sus casi-aciertos.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { companyConfig, missingListRefusal } from './config.mjs';
import { findNames } from './names.mjs';

let failures = 0;
let total = 0;

function check(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const shipped = companyConfig();
const EXPECTED = ['claude', 'anthropic', 'engram', 'openspec', 'gentle-ai', 'copilot', 'chatgpt', 'openai'];

check(shipped.problem === undefined && EXPECTED.every((name) => shipped.names.includes(name)) && shipped.names.length === EXPECTED.length, 'the shipped list holds exactly the eight owner-named tools');
check(shipped.hosts?.length === 1 && shipped.hosts[0] === 'gitlab.base100.local', 'the shipped hosts hold exactly the company GitLab host');
check(!shipped.names.includes('spec-driven'), 'a generic phrase ("spec-driven") is not in the list: names only');

const dir = mkdtempSync(join(tmpdir(), 'company-config-'));
const write = (name, content) => {
  const file = join(dir, name);

  writeFileSync(file, content);

  return file;
};

check(companyConfig(join(dir, 'absent.json')).problem?.includes('cannot read'), 'a missing file is a problem, not an empty list');
check(companyConfig(write('garbage.json', '{nope')).problem?.includes('cannot read'), 'malformed JSON is a problem');
check(companyConfig(write('no-names.json', '{"hosts":["h"]}')).problem?.includes('"names"'), 'a file with no names list is a problem naming "names"');
check(companyConfig(write('empty-names.json', '{"names":[],"hosts":["h"]}')).problem?.includes('"names"'), 'an EMPTY names list is a problem');
check(companyConfig(write('no-hosts.json', '{"names":["a"]}')).problem?.includes('"hosts"'), 'a file with no hosts list is a problem naming "hosts"');
check(companyConfig(write('blank.json', '{"names":["a",""],"hosts":["h"]}')).problem !== undefined, 'a blank entry makes the list unusable');
check(companyConfig(write('typed.json', '{"names":["a",3],"hosts":["h"]}')).problem !== undefined, 'a non-string entry makes the list unusable');
check(JSON.stringify(companyConfig(write('ok.json', '{"names":[" Foo "],"hosts":["HOST.Test"]}'))) === '{"names":["foo"],"hosts":["host.test"]}', 'entries are trimmed and lower-cased');

const refusal = missingListRefusal('X GUARD', 'why');

check(refusal.split('@es')[0].includes('X GUARD REFUSED') && refusal.split('@es')[0].includes('(why)'), 'the refusal names the guard and the problem in English');
check(refusal.includes('@es X GUARD RECHAZÓ') && refusal.includes('falla cerrado'), 'the refusal carries its Spanish half, marked @es, with correct accents');

const names = shipped.names;
const nameOf = (text) => findNames(text, names).map((hit) => hit.name);

check(nameOf('.claude/settings.json').join() === 'claude', 'a path segment ".claude/" matches');
check(nameOf('Fix by Claude').join() === 'claude', 'case is ignored');
check(nameOf('uses gentle-ai sync').join() === 'gentle-ai', 'a hyphenated name matches');
check(nameOf('claudette and copilots').length === 0, 'NEAR MISS: claudette / copilots are not names');
check(nameOf('claude2 and 3claude and claudeñ').length === 0, 'NEAR MISS: a digit or a letter in any script glued to the name defeats the match');
check(nameOf('claudette then claude').join() === 'claude', 'a near miss earlier in the text does not hide a real hit later');
check(nameOf('claude').join() === 'claude', 'a name that is the whole text matches');
check(findNames('say OpenAI and Anthropic', names).map((hit) => hit.index).sort().join() === '15,4', 'hits carry their index');
check(nameOf('plain English spec-driven text').length === 0, 'plain text matches nothing');

rmSync(dir, { recursive: true, force: true });
console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
