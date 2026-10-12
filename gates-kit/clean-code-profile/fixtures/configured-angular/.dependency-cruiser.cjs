module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'core-not-from-pages', severity: 'error', from: { path: '(^|/)src/app/core/' }, to: { path: '(^|/)src/app/pages/' } },
    { name: 'core-not-from-adapters', severity: 'error', from: { path: '(^|/)src/app/core/' }, to: { path: '(^|/)src/app/(adapters|infrastructure)/' } },
    { name: 'domain-framework-free', severity: 'error', from: { path: '(^|/)src/app/(core/)?domain/' }, to: { path: '(^|/)@angular/' } },
  ],
};
