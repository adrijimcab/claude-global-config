/**
 * The verdicts of the gates that ESLint answers: one rule at a threshold (`eslint-rule`) and a set of rules that
 * must all be errors (`eslint-rules-set`). The rule's severity and options come from `eslint --print-config` on
 * a sample file (see `eslint-facts.mjs`); a rule counts as met only at severity `error` and with a limit at or
 * below the profile's. A warning is "present but not met": it does not fail, so it enforces nothing. A rule with
 * no options is graded at the rule's own default limit, which the profile declares per gate.
 *
 * @es Los veredictos de los gates que responde ESLint: una regla con umbral (`eslint-rule`) y un conjunto de
 * reglas que deben ser todas error (`eslint-rules-set`). Severidad y opciones de la regla vienen de `eslint
 * --print-config` sobre un fichero de muestra (ver `eslint-facts.mjs`); una regla se cumple solo con severidad
 * `error` y un límite igual o menor al del perfil. Un aviso es "presente pero no cumplido": no falla, así que no
 * aplica nada. Una regla sin opciones se califica con el límite por defecto de la propia regla, que el perfil
 * declara por gate.
 */

import { landingEvidence, settle, unmeasured, ev, ABSENT } from './verdict-parts.mjs';
import { reach } from './landing-reach.mjs';

const SEVERITIES = { off: 0, warn: 1, error: 2, 0: 0, 1: 1, 2: 2 };

/** 0 off, 1 warn, 2 error. @es 0 apagada, 1 aviso, 2 error. */
export function severityOf(entry) {
  return SEVERITIES[Array.isArray(entry) ? entry[0] : entry] ?? 0;
}

/** The limit a rule entry sets, or `fallback` when it sets none. @es El límite que fija una entrada de regla, o `fallback`. */
export function limitOf(entry, fallback) {
  const option = Array.isArray(entry) ? entry[1] : undefined;

  if (typeof option === 'number') return option;
  if (option !== null && typeof option === 'object') return option.max ?? option.maxComplexity ?? option.maximum ?? fallback;

  return fallback;
}

/** The sample ESLint answered for, or the verdict that says there is none. @es La muestra que ESLint respondió, o el veredicto que dice que no hay. */
function sampleOrVerdict(gate, facts, found) {
  const sample = facts.eslint.samples[gate.sample];

  if (facts.eslintConfig.file === undefined) return { done: settle({ gate, meets: false, present: false, found, evidence: [ev('no-eslint-config', { searched: facts.eslintConfig.searched.join(', ') }), ...landingEvidence(found, 'eslint', facts.landing, facts.root)] }) };
  if (sample === undefined) return { done: { id: gate.id, verdict: ABSENT, evidence: [ev('no-sample', { kind: gate.sample })], landingGuard: false } };
  if (sample.error !== undefined) return { done: unmeasured(gate, [ev('eslint-not-runnable', { file: sample.file, reason: sample.error })]) };

  return { sample };
}

/** The verdict of one rule at one threshold. @es El veredicto de una regla con un umbral. */
export function ruleVerdict(gate, facts) {
  const found = reach(facts.landing, 'eslint');
  const { sample, done } = sampleOrVerdict(gate, facts, found);

  if (done !== undefined) return done;

  const entry = sample.rules[gate.rule];
  const severity = severityOf(entry);
  const actual = limitOf(entry, gate.defaultMax);
  const params = { rule: gate.rule, file: sample.file, actual, max: gate.max };
  const meets = severity === 2 && actual <= gate.max;
  let reason = ev('rule-ok', params);

  if (severity === 0) reason = ev('rule-off', params);
  else if (severity === 1) reason = ev('rule-warns', params);
  else if (!meets) reason = ev('rule-too-loose', params);

  return settle({ gate, meets, present: severity > 0, found, evidence: [reason, ...landingEvidence(found, 'eslint', facts.landing, facts.root)] });
}

/** The verdict of a set of rules that must all be errors. @es El veredicto de un conjunto de reglas que deben ser todas error. */
export function ruleSetVerdict(gate, facts) {
  const found = reach(facts.landing, 'eslint');
  const { sample, done } = sampleOrVerdict(gate, facts, found);

  if (done !== undefined) return done;

  const missing = gate.rules.filter((rule) => severityOf(sample.rules[rule]) !== 2);
  const meets = missing.length === 0;
  const shown = missing.length > 3 ? `${missing.slice(0, 3).join(', ')} and ${missing.length - 3} more` : missing.join(', ');
  const reason = meets ? ev('rules-ok', { count: gate.rules.length, file: sample.file }) : ev('rules-missing', { missing: shown, file: sample.file });

  return settle({ gate, meets, present: missing.length < gate.rules.length, found, evidence: [reason, ...landingEvidence(found, 'eslint', facts.landing, facts.root)] });
}
