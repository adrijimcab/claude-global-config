/**
 * dependency-cruiser config for the circular-import gate: one error rule, no circular import anywhere in the
 * scanned tree. The scan is scoped with `includeOnly` to what lives under a `src/` folder.
 *
 * @es Config de dependency-cruiser para el gate de imports circulares: una regla de error, ningún import
 * circular en el árbol escaneado. El escaneo se acota con `includeOnly` a lo que vive bajo una carpeta `src/`.
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
  ],
  options: {
    includeOnly: '(^|/)src/',
    tsPreCompilationDeps: true,
  },
};
