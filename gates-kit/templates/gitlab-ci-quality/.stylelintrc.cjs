// Styles lint with the shared plugin (@base100/stylelint-plugin ^1.0.0). SCSS needs the postcss-scss custom
// syntax: without it Stylelint parses `.scss` as plain CSS and reports false syntax errors on `//` comments
// and SCSS maps, which hides real findings. ADOPTION RULE: a rule appears here only when it measured ZERO
// offenders on the tree; otherwise fix the code first and add the rule afterwards. There is no list of
// rules registered but switched off.
// @es Lint de estilos con el plugin compartido (@base100/stylelint-plugin ^1.0.0). El SCSS necesita la
// sintaxis personalizada postcss-scss: sin ella Stylelint parsea `.scss` como CSS plano y reporta falsos
// errores de sintaxis en comentarios `//` y mapas SCSS, lo que oculta hallazgos reales. REGLA DE ADOPCIÓN:
// una regla aparece aquí solo cuando midió CERO infractores en el árbol; si no, primero se corrige el
// código y después se agrega la regla. No hay lista de reglas registradas pero apagadas.
module.exports = {
  plugins: ['@base100/stylelint-plugin'],
  customSyntax: 'postcss-scss',
  rules: {
    'b100/prefer-reduced-motion-mixin': true,
    'b100/require-host-display': true,
    'b100/no-viewport-media-query': true,
    'b100/container-query-safety': true,
    'b100/use-focus-ring-mixin': true,
  },
};
