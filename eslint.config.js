/**
 * ESLint flat config (ARES convention: surface real bugs, Prettier owns
 * formatting). TypeScript files are typechecked by tsc; eslint covers JS.
 */

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'public/', 'coverage/', 'docs/', '.specify/', '.claude/', '**/*.ts'],
  },

  js.configs.recommended,

  // --- Backend / build scripts (ESM, Node) ---
  {
    files: ['server.js', 'worker/**/*.js', 'frontend/build.js', 'scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // --- Frontend scripts (browser, concatenated — Ractive is a global) ---
  {
    files: ['frontend/scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser, Ractive: 'readonly' },
    },
  },
];
