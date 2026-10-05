/**
 * dependency-cruiser config for the Angular layering gate: no circular import anywhere, and the `core` layer
 * never depends on a `pages` feature (dependencies point from pages to core, never back). Every rule is an
 * error. The scan is scoped with `includeOnly` to what lives under a `src/` folder.
 *
 * @es Config de dependency-cruiser para el gate de capas de Angular: ningún import circular y la capa `core`
 * nunca depende de una feature de `pages` (las dependencias van de pages a core, nunca al revés). Toda regla
 * es de error. El escaneo se acota con `includeOnly` a lo que vive bajo una carpeta `src/`.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'A cycle makes load order and change impact unpredictable. @es Un ciclo hace impredecibles el orden de carga y el impacto de un cambio.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
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
