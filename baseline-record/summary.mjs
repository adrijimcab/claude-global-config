/**
 * The bilingual human summary of a baseline record: one line per fact, English first, then `@es`, then
 * Spanish, every one rendered from the message table below. An entry without its Spanish half throws, so does
 * an unknown id or a placeholder with no value: a line can never print half translated. A figure that was not
 * measured is printed as NOT MEASURED with its command's exit code, never as zero or clean. The Stop latency
 * of a clean run set and of a dirty one are on their own lines and never merged; there is no mutation
 * aggregate anywhere in the record, so there is none here.
 *
 * @es El resumen humano bilingüe de un registro base: una línea por hecho, inglés primero, luego `@es` y el
 * español, todas renderizadas desde la tabla de abajo. Una entrada sin su mitad española lanza, igual que un
 * id desconocido o un marcador sin valor: ninguna línea sale a medio traducir. Una cifra no medida se imprime
 * como SIN MEDIR con el código de salida de su comando, nunca como cero o limpio. La latencia de Stop de una
 * corrida limpia y la de una sucia van en líneas propias y no se mezclan; el registro no tiene ningún
 * agregado de mutación, así que aquí tampoco.
 */

/** Every printed line, English first and the Spanish half beside it. @es Cada línea impresa, con su mitad española al lado. */
export const MESSAGES = {
  title: { en: 'Baseline record taken at {at}.', es: 'Registro base tomado el {at}.' },
  budgetGlobal: { en: 'Global always-loaded set: {raw} raw characters (harness-counted {counted}) against the ceiling {ceiling}; command: {command}; exit {exit}.', es: 'Conjunto global siempre cargado: {raw} caracteres brutos (contados por el harness {counted}) frente al techo {ceiling}; comando: {command}; salida {exit}.' },
  budgetProject: { en: 'b100 always-loaded set (global plus project): {raw} raw characters (harness-counted {counted}), of which {own} in the project files; command: {command}; exit {exit}.', es: 'Conjunto b100 siempre cargado (global más proyecto): {raw} caracteres brutos (contados por el harness {counted}), de ellos {own} en los ficheros del proyecto; comando: {command}; salida {exit}.' },
  noBudgetGlobal: { en: 'NOT MEASURED: the global always-loaded set (exit {exit}; command: {command}).', es: 'SIN MEDIR: el conjunto global siempre cargado (salida {exit}; comando: {command}).' },
  noBudgetProject: { en: 'NOT MEASURED: the b100 always-loaded set (exit {exit}; command: {command}).', es: 'SIN MEDIR: el conjunto b100 siempre cargado (salida {exit}; comando: {command}).' },
  journals: { en: 'Guard journals: {files} files, {lines} lines in total.', es: 'Journals de guardias: {files} ficheros, {lines} líneas en total.' },
  journalsPerGuard: { en: 'Journal lines per guard: {list}.', es: 'Líneas de journal por guardia: {list}.' },
  registry: { en: 'Hook registry: {events} settings events with {hooks} hooks; {manifests} manifests with {guards} guards; {sidecars} registration sidecars.', es: 'Registro de hooks: {events} eventos de settings con {hooks} hooks; {manifests} manifiestos con {guards} guardias; {sidecars} sidecars de registro.' },
  noRegistry: { en: 'NOT MEASURED: the hook registry (settings.json cannot be read).', es: 'SIN MEDIR: el registro de hooks (no se puede leer settings.json).' },
  tip: { en: 'Git tip of {name}: {tip} on {branch}.', es: 'Punta de git de {name}: {tip} en {branch}.' },
  noTip: { en: 'NOT MEASURED: git tip of {name} (exit {exit}).', es: 'SIN MEDIR: punta de git de {name} (salida {exit}).' },
  repoClean: { en: 'Product repo {name}: clean.', es: 'Repo de producto {name}: limpio.' },
  repoDirty: { en: 'Product repo {name}: {count} changed paths: {paths}.', es: 'Repo de producto {name}: {count} rutas cambiadas: {paths}.' },
  noRepoStatus: { en: 'NOT MEASURED: status of product repo {name} (exit {exit}).', es: 'SIN MEDIR: estado del repo de producto {name} (salida {exit}).' },
  noRepos: { en: 'No product repository found under the projects root.', es: 'No se encontró ningún repositorio de producto bajo la raíz de proyectos.' },
  discovery: { en: 'di_1700002_discovery_fe/.claude/: {files} files and {bytes} bytes in {entries} top-level entries; {status} git status lines.', es: 'di_1700002_discovery_fe/.claude/: {files} ficheros y {bytes} bytes en {entries} entradas de primer nivel; {status} líneas de git status.' },
  discoveryNoStatus: { en: 'di_1700002_discovery_fe/.claude/: {files} files and {bytes} bytes in {entries} top-level entries; git status NOT MEASURED (exit {exit}).', es: 'di_1700002_discovery_fe/.claude/: {files} ficheros y {bytes} bytes en {entries} entradas de primer nivel; git status SIN MEDIR (salida {exit}).' },
  discoveryMissing: { en: 'di_1700002_discovery_fe/.claude/ is missing, nothing was inventoried.', es: 'di_1700002_discovery_fe/.claude/ no existe, no se inventarió nada.' },
  latencyClean: { en: 'Stop latency, clean repos: median {median} ms, p95 {p95} ms, first run {first} ms, {runs} runs.', es: 'Latencia de Stop, repos limpios: mediana {median} ms, p95 {p95} ms, primera corrida {first} ms, {runs} corridas.' },
  latencyDirty: { en: 'Stop latency, dirty repos: median {median} ms, p95 {p95} ms, first run {first} ms, {runs} runs.', es: 'Latencia de Stop, repos sucios: mediana {median} ms, p95 {p95} ms, primera corrida {first} ms, {runs} corridas.' },
  latencyUnknown: { en: 'Stop latency, repo state unknown: median {median} ms, p95 {p95} ms, first run {first} ms, {runs} runs.', es: 'Latencia de Stop, estado de los repos desconocido: mediana {median} ms, p95 {p95} ms, primera corrida {first} ms, {runs} corridas.' },
  latencyCleanNone: { en: 'Stop latency, clean repos: not measured in this run set (a repo was dirty).', es: 'Latencia de Stop, repos limpios: no medida en este conjunto de corridas (un repo estaba sucio).' },
  latencyDirtyNone: { en: 'Stop latency, dirty repos: not measured in this run set (every repo was clean).', es: 'Latencia de Stop, repos sucios: no medida en este conjunto de corridas (todos los repos estaban limpios).' },
  latencyReach: { en: 'Stop latency reach: {live} live transcripts in 30 minutes, {finished} finished-worker transcripts in 6 hours, {bytes} transcript bytes.', es: 'Alcance de la latencia de Stop: {live} transcripts vivos en 30 minutos, {finished} transcripts de workers terminados en 6 horas, {bytes} bytes de transcripts.' },
  latencyRepos: { en: 'Stop latency repos: {list}.', es: 'Repos de la latencia de Stop: {list}.' },
  noLatency: { en: 'NOT MEASURED: Stop latency (exit {exit}; command: {command}).', es: 'SIN MEDIR: latencia de Stop (salida {exit}; comando: {command}).' }
};

/** One line in the house form `English @es Español`, or a bilingual throw. @es Una línea en la forma de la casa, o un fallo bilingüe. */
export function renderLine(table, id, params) {
  const entry = Object.hasOwn(table, id) ? table[id] : undefined;

  if (entry === undefined) throw new Error(`Unknown message id ${id}. @es Id de mensaje desconocido ${id}.`);
  if (typeof entry.en !== 'string' || entry.en === '' || typeof entry.es !== 'string' || entry.es === '') throw new Error(`Message ${id} lacks its English or Spanish half. @es Al mensaje ${id} le falta su mitad en inglés o en español.`);

  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!Object.hasOwn(params, name)) throw new Error(`Message ${id} has no value for {${name}}. @es El mensaje ${id} no tiene valor para {${name}}.`);

    return String(params[name]);
  });

  return `${fill(entry.en)} @es ${fill(entry.es)}`;
}

const line = (id, params) => renderLine(MESSAGES, id, params);

/** The budget lines of one measurement, or its NOT MEASURED line. @es Las líneas de presupuesto de una medición, o su línea SIN MEDIR. */
function budgetLine(figures, ids) {
  if (!figures.measured) return line(ids.none, { exit: figures.exitCode, command: figures.command });

  return line(ids.line, { raw: figures.rawChars, counted: figures.harnessChars, ceiling: figures.ceiling, own: figures.projectRawChars, command: figures.command, exit: figures.exitCode });
}

/** The line about the discovery `.claude/` directory: missing, inventoried with its git status, or with a git status that failed. @es La línea sobre el `.claude/` de discovery. */
function discoveryLine({ inventory, porcelain }) {
  if (!inventory.exists) return line('discoveryMissing', {});

  const counts = { files: inventory.totalFiles, bytes: inventory.totalBytes, entries: inventory.entries.length };

  return porcelain.measured ? line('discovery', { ...counts, status: porcelain.lines.length }) : line('discoveryNoStatus', { ...counts, exit: porcelain.exitCode });
}

/** The Stop latency lines: the clean and the dirty run set each on their own line. @es Las líneas de latencia de Stop: la limpia y la sucia, cada una en su línea. */
function latencyLines(latency) {
  if (!latency.measured) return [line('noLatency', { exit: latency.exitCode, command: latency.command })];

  const result = latency.result;
  const figures = { median: result.medianMs, p95: result.p95Ms, first: result.firstMs, runs: result.runs };
  const byScenario = { clean: [line('latencyClean', figures), line('latencyDirtyNone', {})], dirty: [line('latencyCleanNone', {}), line('latencyDirty', figures)], unknown: [line('latencyUnknown', figures)] };
  const states = result.repos.map((repo) => `${repo.name}=${repo.dirty === true ? 'dirty' : repo.dirty === false ? 'clean' : 'unreadable'}`).join(', ');

  return [...byScenario[result.scenario], line('latencyReach', { live: result.liveTranscripts30min, finished: result.finishedWorkerTranscripts6h, bytes: result.transcriptBytes }), line('latencyRepos', { list: states })];
}

/** Every line of the summary of `record`. @es Cada línea del resumen de `record`. */
export function renderSummary(record) {
  const { budget, journals, registry, tips, productRepos, discoveryClaude } = record;
  const inventory = discoveryClaude.inventory;

  return [
    line('title', { at: record.recordedAt }),
    budgetLine(budget.global, { line: 'budgetGlobal', none: 'noBudgetGlobal' }),
    budgetLine(budget.project, { line: 'budgetProject', none: 'noBudgetProject' }),
    line('journals', { files: journals.files.length, lines: journals.totalLines }),
    line('journalsPerGuard', { list: Object.entries(journals.perGuard).map(([guard, lines]) => `${guard}=${lines}`).join(', ') }),
    registry.settings === 'unreadable' ? line('noRegistry', {}) : line('registry', { events: Object.keys(registry.settings.events).length, hooks: registry.settings.totalHooks, manifests: Object.keys(registry.manifests.files).length, guards: registry.manifests.totalGuards, sidecars: registry.sidecars }),
    ...tips.map((tip) => (tip.tip === undefined ? line('noTip', { name: tip.name, exit: tip.tipExit }) : line('tip', { name: tip.name, tip: tip.tip, branch: tip.branch }))),
    ...(productRepos.length === 0 ? [line('noRepos', {})] : productRepos.map((repo) => (!repo.measured ? line('noRepoStatus', { name: repo.name, exit: repo.exitCode }) : repo.lines.length === 0 ? line('repoClean', { name: repo.name }) : line('repoDirty', { name: repo.name, count: repo.lines.length, paths: repo.lines.join('; ') })))),
    discoveryLine(discoveryClaude),
    ...latencyLines(record.stopLatency)
  ];
}
