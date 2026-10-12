/**
 * dependency-cruiser config for the Angular layering gate, the hexagonal direction of dependencies. Three error
 * rules: the `core` layer never depends on a `pages` feature, `core` never depends on an `adapters` or
 * `infrastructure` folder (an adapter implements a port that core owns, so the arrow points from the adapter to
 * core), and a `domain` folder (`src/app/domain/` or `src/app/core/domain/`) never imports the Angular framework.
 * The scan starts from the `src/` folder given to it and records, without following, a dependency on a package.
 *
 * @es Config de dependency-cruiser para el gate de capas de Angular, la dirección hexagonal de las dependencias.
 * Tres reglas de error: la capa `core` nunca depende de una feature de `pages`, `core` nunca depende de una
 * carpeta `adapters` o `infrastructure` (un adaptador implementa un puerto que posee core, así que la flecha va
 * del adaptador a core) y una carpeta `domain` (`src/app/domain/` o `src/app/core/domain/`) nunca importa el
 * framework Angular. El escaneo parte de la carpeta `src/` que se le da y registra, sin seguirla, una
 * dependencia de un paquete.
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
    {
      name: 'core-not-from-adapters',
      comment: 'An adapter implements a port that core owns, so core must not import an adapters or infrastructure folder. @es Un adaptador implementa un puerto que posee core, así que core no debe importar una carpeta adapters o infrastructure.',
      severity: 'error',
      from: { path: '(^|/)src/app/core/' },
      to: { path: '(^|/)src/app/(adapters|infrastructure)/' },
    },
    {
      name: 'domain-framework-free',
      comment: 'The domain holds business rules and knows no framework: it must not import Angular. @es El dominio guarda reglas de negocio y no conoce ningún framework: no debe importar Angular.',
      severity: 'error',
      from: { path: '(^|/)src/app/(core/)?domain/' },
      to: { path: '(^|/)@angular/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
  },
};
