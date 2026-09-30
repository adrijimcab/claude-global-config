/**
 * Which changed files are graded, and by which configured coverage project.
 *
 * A file is graded by the FIRST project whose `sourceRoot` prefixes it, when it carries one of the
 * project's `extensions`, ends with none of its `excludeSuffixes`, and contains none of its
 * `excludeSegments`. Structured prefix/suffix/segment rules instead of globs: they read as intent, they
 * cannot silently fail to match the way a pattern can, and no glob engine is needed.
 *
 * @es Qué ficheros cambiados se califican y con qué proyecto de cobertura configurado. Reglas
 * estructuradas de prefijo/sufijo/segmento en vez de globs: se leen como intención y no pueden dejar de
 * casar en silencio.
 */

/** Whether `file` (repo-relative, `/`) is graded by `project`. @es Si `project` califica `file`. */
export function isGradedBy(project, file) {
  if (!file.startsWith(project.sourceRoot)) return false;
  if (!project.extensions.some((extension) => file.endsWith(extension))) return false;
  if (project.excludeSuffixes.some((suffix) => file.endsWith(suffix))) return false;

  const rooted = `/${file}`;

  return !project.excludeSegments.some((segment) => rooted.includes(segment));
}

/**
 * Splits changed lines by the project that grades each file.
 * @param changedLinesByFile `Map<file, number[]>`.
 * @returns `{ byProject: Map<projectName, Map<file, number[]>>, ungraded: string[] }`.
 * @es Reparte las líneas cambiadas por el proyecto que califica cada fichero.
 */
export function groupByProject(changedLinesByFile, projects) {
  const byProject = new Map();
  const ungraded = [];

  for (const [file, lines] of changedLinesByFile) {
    const project = projects.find((candidate) => isGradedBy(candidate, file));

    if (project === undefined) {
      ungraded.push(file);
      continue;
    }

    const files = byProject.get(project.name) ?? new Map();

    files.set(file, lines);
    byProject.set(project.name, files);
  }

  return { byProject, ungraded };
}
