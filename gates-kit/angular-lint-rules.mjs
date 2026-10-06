/**
 * The angular-eslint rules the Angular lint gate turns on, per Angular major. A rule is on from the first
 * major whose plugin holds it AND whose official guidance asks for what it enforces, until the last major whose
 * guidance still asks for it (a rule with no last major stays on); outside that span it is not
 * configured at all (a rule the plugin lacks would stop ESLint, and a rule the guidance of that major does
 * not support would grade code against advice that did not exist yet). Every rule on is `error`.
 *
 * | Rule | From | Why that major |
 * |---|---|---|
 * | `@angular-eslint/prefer-signals` | 19 | signal inputs, outputs and queries are stable from 19.0 |
 * | `@angular-eslint/no-experimental` | 20 | experimental APIs are forbidden by default; the rule is absent from the 19.8.1 plugin |
 * | `@angular-eslint/no-developer-preview` | 20 | developer-preview APIs likewise; absent from 19.8.1 |
 * | `@angular-eslint/prefer-inject` | 20 | the 2025 style guide (20+) prefers `inject()`; the 19 guide shows constructors |
 * | `@angular-eslint/prefer-host-metadata-property` | 20 | 20+ guidance: always `host`; the 19 guide still says "consider @HostBinding"; absent from 19.8.1 |
 * | `@angular-eslint/template/prefer-control-flow` | 20 | `NgIf`/`NgFor`/`NgSwitch` are deprecated from 20.0 |
 * | `@angular-eslint/prefer-service-decorator` | 22 | `@Service()` exists from 22.0; absent from the 21.4.0 plugin |
| `@angular-eslint/prefer-on-push-component-change-detection` | 19 to 21 | the guidance writes `OnPush` explicitly until 21; from 22 it is the default and `rules/fe-angular.md` says to omit it, so the rule would grade the advice backwards. Present in plugins 19.8.1, 20.7.0, 21.4.0 and 22.5.0 (`npm pack`, 2026-10-06) |
 *
 * Sources: the Angular research of 2026-10-06 (angular/angular branches 19.2.x to 22.2.x, section 4 "Rule-gating
 * cheat sheet" and its lint guard rails), and the rule tables of the installed plugins, read per toolchain.
 *
 * Decision: a major outside the table throws instead of returning a near major's rules; the gate config then
 * fails to load and the gate goes red rather than grading with the wrong set.
 *
 * @es Las reglas de angular-eslint que activa el gate de lint de Angular, por major. Una regla se activa desde la
 * primera major cuyo plugin la tiene Y cuya guía oficial pide lo que impone; antes no se configura (una regla
 * ausente detendría ESLint, y una que la guía de esa major no respalda juzgaría con un consejo que aún no
 * existía) y hasta la última major cuya guía aún la pide (OnPush explícito: 19 a 21; en 22 es el valor por
 * defecto). Toda regla activa es `error`. Una major fuera de la tabla lanza en vez de devolver las reglas de una
 * major cercana.
 */

/** `[rule, first major, last major?]` (no last major: on to the end), ordered by rule name within each major. @es `[regla, primera major, última major?]`. */
export const RULE_TABLE = [
  ['@angular-eslint/prefer-signals', 19],
  ['@angular-eslint/no-developer-preview', 20],
  ['@angular-eslint/no-experimental', 20],
  ['@angular-eslint/prefer-host-metadata-property', 20],
  ['@angular-eslint/prefer-inject', 20],
  ['@angular-eslint/template/prefer-control-flow', 20],
  ['@angular-eslint/prefer-service-decorator', 22],
  ['@angular-eslint/prefer-on-push-component-change-detection', 19, 21],
];

/** The majors the table covers. @es Las majors que cubre la tabla. */
export const LINT_MAJORS = [19, 20, 21, 22];

/** The prefix of the template plugin's rules. @es El prefijo de las reglas del plugin de plantillas. */
const TEMPLATE_PREFIX = '@angular-eslint/template/';

/**
 * `{ ts, template }`: the rules on for `major`, each `'error'`, split by the plugin that owns them.
 * @es Las reglas activas para `major`, cada una `'error'`, separadas por el plugin que las define.
 */
export function angularRulesFor(major) {
  if (!LINT_MAJORS.includes(major)) throw new Error(`no angular-eslint rule set for Angular major ${major} @es no hay conjunto de reglas de angular-eslint para la major ${major} de Angular`);

  const on = RULE_TABLE.filter(([, from, to = Infinity]) => major >= from && major <= to).map(([rule]) => rule);
  const pick = (rules) => Object.fromEntries(rules.map((rule) => [rule, 'error']));

  return { ts: pick(on.filter((rule) => !rule.startsWith(TEMPLATE_PREFIX))), template: pick(on.filter((rule) => rule.startsWith(TEMPLATE_PREFIX))) };
}

/** The Angular major of an angular-eslint version: their majors move together. @es La major de Angular de una versión de angular-eslint. */
export function majorOfAngularEslint(version) {
  const major = Number(String(version).split('.')[0]);

  if (!Number.isInteger(major) || String(version).split('.').length !== 3) throw new Error(`not an angular-eslint version: ${version} @es no es una versión de angular-eslint: ${version}`);

  return major;
}
