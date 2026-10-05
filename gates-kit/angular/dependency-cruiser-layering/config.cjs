/**
 * dependency-cruiser config for the Angular layering gate: one error rule, the `core` layer never depends on
 * a `pages` feature (dependencies point from pages to core, never back). The scan is scoped with
 * `includeOnly` to what lives under a `src/` folder.
 *
 * @es Config de dependency-cruiser para el gate de capas de Angular: una regla de error, la capa `core`
 * nunca depende de una feature de `pages` (las dependencias van de pages a core, nunca al revés). El
 * escaneo se acota con `includeOnly` a lo que vive bajo una carpeta `src/`.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-not-from-pages',
      comment: 'core is the lower layer: it must not import a pages feature. @es core es la capa baja: no debe importar una feature de pages.',
      severity: 'error',
      from: { path: '(^|/)src/app/core/' },
      to: { path: '(^|/)src/app/pages/' },
    },
  ],
  options: {
    includeOnly: '(^|/)src/',
    tsPreCompilationDeps: true,
  },
};
