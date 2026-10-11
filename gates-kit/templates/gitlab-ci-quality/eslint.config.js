// Lint standard: the shared plugin's `consumer` preset (@base100/eslint-plugin ^3.0.0) plus
// eslint-plugin-security. The preset is spread as is and never re-listed rule by rule, because it carries
// `settings.b100.consumerMode`, which several rules need. ADOPTION RULE: a rule is enabled only when it
// measured ZERO offenders on the tree; otherwise fix the code first and enable it afterwards. There is no
// list of rules registered but switched off.
// @es Estándar de lint: el preset `consumer` del plugin compartido (@base100/eslint-plugin ^3.0.0) más
// eslint-plugin-security. El preset se hace spread tal cual y nunca se reenumera regla por regla, porque
// lleva `settings.b100.consumerMode`, que varias reglas necesitan. REGLA DE ADOPCIÓN: una regla se activa
// solo cuando midió CERO infractores en el árbol; si no, primero se corrige el código y después se activa.
// No hay lista de reglas registradas pero apagadas.
import { defineConfig } from 'eslint/config';
import b100 from '@base100/eslint-plugin';
import security from 'eslint-plugin-security';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', '**/*.d.ts'] },
  ...b100.configs.consumer,
  // Security rules: the three that are noisy on dynamic-but-safe code stay warnings; fixing a warning at its
  // root is how it is promoted to an error.
  // @es Reglas de seguridad: las tres que son ruidosas en código dinámico-pero-seguro quedan como avisos;
  // corregir un aviso en su raíz es como se asciende a error.
  {
    files: ['**/*.ts'],
    plugins: { security },
    rules: {
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'error',
      'security/detect-object-injection': 'warn',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',
    },
  },
);
