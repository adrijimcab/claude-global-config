// Lighthouse CI budgets. Lab metrics vary from run to run, so the audit runs 3 times and every assertion
// is made on the MEDIAN (`aggregationMethod: 'median'`; the default, `optimistic`, would pass on the best
// run). The accessibility score is an `error` at 0.9; the other categories and metrics are warnings that
// become errors only once they measure green. Replace <APP_DIST_DIR> and <ROUTE>.
// @es Presupuestos de Lighthouse CI. Las métricas de laboratorio varían entre corridas, así que la
// auditoría corre 3 veces y cada afirmación se hace sobre la MEDIANA (`aggregationMethod: 'median'`; el
// valor por defecto, `optimistic`, pasaría con la mejor corrida). El puntaje de accesibilidad es un `error`
// en 0.9; las otras categorías y métricas son avisos que pasan a error solo cuando miden en verde.
// Reemplazar <APP_DIST_DIR> y <ROUTE>.
module.exports = {
  ci: {
    collect: {
      staticDistDir: './<APP_DIST_DIR>',
      url: ['http://localhost/<ROUTE>'],
      numberOfRuns: 3,
      settings: { chromeFlags: '--no-sandbox' },
    },
    assert: {
      aggregationMethod: 'median',
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:performance': ['warn', { minScore: 0.7 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
};
