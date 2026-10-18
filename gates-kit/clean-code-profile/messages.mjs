/**
 * Every sentence the clean-code checker prints, English first and its Spanish half marked `@es`: the evidence of a
 * verdict (one message per fact the checker can state) and the command's own lines. `check.mjs` prints only
 * through `bilingual-output/speaker.mjs` over this table, which refuses a table with a missing half.
 *
 * @es Cada frase que imprime el checker de código limpio, inglés primero y su mitad española marcada `@es`: la
 * evidencia de un veredicto (un mensaje por hecho que el checker puede afirmar) y las líneas del propio comando.
 * `check.mjs` imprime solo a través de `bilingual-output/speaker.mjs` sobre esta tabla, que rechaza una tabla
 * con una mitad ausente.
 */

export const MESSAGES = {
  usage: { en: 'usage: check.mjs <project root> [--stack angular|node] [--strict]', es: 'uso: check.mjs <raíz del proyecto> [--stack angular|node] [--strict]' },
  notADirectory: { en: '{root} is not a directory, nothing was measured', es: '{root} no es un directorio, no se midió nada' },
  header: { en: 'Clean-code profile of {root} (stack {stack})', es: 'Perfil de código limpio de {root} (stack {stack})' },
  roots: { en: 'landing roots read: {roots}', es: 'raíces de aterrizaje leídas: {roots}' },
  noRoots: { en: 'no landing root found: no unit suite in fleet-kit.json, no whole-gate script, no hook, no CI job', es: 'no hay ninguna raíz de aterrizaje: ni suite de unidad en fleet-kit.json, ni script de gate completo, ni hook, ni job de CI' },
  summary: {
    en: '{enforced} enforced, {configured} configured-only, {absent} absent, {unmeasured} unmeasured, of {total} gates',
    es: '{enforced} aplicados, {configured} solo configurados, {absent} ausentes, {unmeasured} sin medir, de {total} gates',
  },
  crashed: { en: 'the check crashed before it measured everything: {reason}', es: 'la comprobación falló antes de medirlo todo: {reason}' },
  'input-unreadable': { en: 'NOT MEASURED: {file} cannot be read or is not valid JSON, so the project could not be graded', es: 'NO MEDIDO: {file} no se puede leer o no es JSON válido, así que no se pudo calificar el proyecto' },
  'jscpd-unreadable': { en: 'NOT MEASURED: the jscpd settings {file} cannot be read or are not valid JSON', es: 'NO MEDIDO: los ajustes de jscpd {file} no se pueden leer o no son JSON válido' },
  strictFailed: { en: '--strict: {count} gate(s) are not enforced', es: '--strict: {count} gate(s) no están aplicados' },
  reached: { en: 'runs on the landing path: {record}', es: 'corre en el camino de aterrizaje: {record}' },
  'reached-not-enforcing': { en: 'reached only from a root that does not enforce: {record}', es: 'alcanzado solo desde una raíz que no aplica: {record}' },
  'not-reached': { en: 'no {tool} command on the landing path (roots read: {roots})', es: 'ningún comando de {tool} en el camino de aterrizaje (raíces leídas: {roots})' },
  'no-eslint-config': { en: 'no ESLint config file (searched: {searched})', es: 'ningún fichero de config de ESLint (buscado: {searched})' },
  'eslint-config': { en: 'ESLint config {file}', es: 'config de ESLint {file}' },
  'no-sample': { en: 'the project has no {kind} sample file to ask ESLint about', es: 'el proyecto no tiene fichero de muestra {kind} para preguntar a ESLint' },
  'eslint-not-runnable': { en: 'ESLint could not be measured on {file}: {reason}', es: 'No se pudo medir ESLint sobre {file}: {reason}' },
  'rule-ok': { en: '{rule} is an error with limit {actual} (profile {max}) on {file}', es: '{rule} es un error con límite {actual} (perfil {max}) en {file}' },
  'rule-off': { en: '{rule} is off or unset on {file}', es: '{rule} está apagada o sin definir en {file}' },
  'rule-warns': { en: '{rule} is only a warning on {file}; a warning does not fail', es: '{rule} es solo un aviso en {file}; un aviso no falla' },
  'rule-too-loose': { en: '{rule} allows {actual} on {file}, above the profile limit {max}', es: '{rule} permite {actual} en {file}, sobre el límite del perfil {max}' },
  'rules-ok': { en: 'all {count} rules are errors on {file}', es: 'las {count} reglas son errores en {file}' },
  'rules-missing': { en: 'not at error on {file}: {missing}', es: 'no están en error en {file}: {missing}' },
  'tsc-not-runnable': { en: 'the compiler could not be asked about {file}: {reason}', es: 'no se pudo preguntar al compilador por {file}: {reason}' },
  'no-tsconfig': { en: 'no tsconfig.json at the project root', es: 'ningún tsconfig.json en la raíz del proyecto' },
  'strict-on': { en: '{file} resolves to strict: true', es: '{file} resuelve a strict: true' },
  'strict-off': { en: '{file} does not resolve to strict: true', es: '{file} no resuelve a strict: true' },
  'no-depcruise-config': { en: 'no dependency-cruiser config at the project root', es: 'ninguna config de dependency-cruiser en la raíz del proyecto' },
  'depcruise-unreadable': { en: 'dependency-cruiser config {file} could not be loaded: {reason}', es: 'la config de dependency-cruiser {file} no se pudo cargar: {reason}' },
  'circular-rule': { en: '{file} forbids cycles at error', es: '{file} prohíbe los ciclos en error' },
  'no-circular-rule': { en: '{file} has no error rule forbidding cycles', es: '{file} no tiene ninguna regla de error que prohíba los ciclos' },
  'madge-declared': { en: 'madge is a declared dependency: an equivalent the checker names but does not credit', es: 'madge es una dependencia declarada: un equivalente que el checker nombra pero no acredita' },
  'layering-ok': { en: '{file} forbids all {count} hexagonal probe dependencies', es: '{file} prohíbe las {count} dependencias de sonda hexagonales' },
  'layering-missing': { en: '{file} does not forbid: {missing}', es: '{file} no prohíbe: {missing}' },
  'jscpd-ok': { en: 'jscpd minTokens {tokens} (profile {needed} or lower), threshold {threshold}, from {from}', es: 'jscpd minTokens {tokens} (perfil {needed} o menor), umbral {threshold}, desde {from}' },
  'jscpd-weak': { en: 'jscpd minTokens {tokens} (profile {needed} or lower) and threshold {threshold} (profile 0), from {from}', es: 'jscpd minTokens {tokens} (perfil {needed} o menor) y umbral {threshold} (perfil 0), desde {from}' },
  'no-jscpd': { en: 'no jscpd config and no jscpd command', es: 'ninguna config de jscpd ni comando jscpd' },
  'knip-config': { en: 'knip config {file}', es: 'config de knip {file}' },
  'knip-script': { en: 'a package script runs knip', es: 'un script de package ejecuta knip' },
  'no-knip': { en: 'no knip config and no script that runs knip', es: 'ninguna config de knip ni script que ejecute knip' },
  'knip-ignore-debt': { en: 'DEBT: {count} ignore entries in {file}; the target is zero', es: 'DEUDA: {count} entradas ignore en {file}; el objetivo es cero' },
  'knip-ignore-unmeasured': { en: 'NOT MEASURED: the ignore entries of {file} could not be counted ({reason})', es: 'NO MEDIDO: no se pudieron contar las entradas ignore de {file} ({reason})' },
  'audit-in-scripts': { en: 'a package script runs npm audit, but not from any landing root', es: 'un script de package ejecuta npm audit, pero no desde ninguna raíz de aterrizaje' },
  'no-audit': { en: 'no npm audit command anywhere', es: 'ningún comando npm audit en ningún sitio' },
  'audit-level-ok': { en: 'npm audit levels seen: {levels}; a blocking one meets {needed}', es: 'niveles de npm audit vistos: {levels}; uno bloqueante cumple {needed}' },
  'audit-level-weak': { en: 'npm audit levels seen: {levels}; none that blocks meets {needed}', es: 'niveles de npm audit vistos: {levels}; ninguno que bloquee cumple {needed}' },
};
