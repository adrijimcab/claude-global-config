module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'warn', from: {}, to: { circular: true } },
    { name: 'core-not-from-pages', severity: 'error', from: { path: '(^|/)src/app/core/' }, to: { path: '(^|/)src/app/pages/' } },
    { name: 'domain-framework-free', severity: 'error', from: { path: '(^|/)src/app/domain/', pathNot: '(^|/)src/app/domain/' }, to: { path: '(^|/)@angular/' } },
  ],
};
