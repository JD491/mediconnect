// FIX: added ignorePatterns — without it, `eslint .` also lints the built dist/ bundle
// (a minified file) and node_modules, producing hundreds of false-positive errors.
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  ignorePatterns: ['dist', 'node_modules'],
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  rules: { 'react/react-in-jsx-scope': 'off', 'react/prop-types': 'off' },
  overrides: [
    {
      // .ts/.tsx need the TypeScript parser — the default parser (espree) can't
      // read type annotations/interfaces/generics at all, which meant these
      // files were previously either skipped entirely or would hard-fail
      // parsing; this override is what actually makes `npm run lint` check them.
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
      rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'no-undef': 'off', // TypeScript itself catches undefined identifiers; no-undef false-positives on TS-only syntax (e.g. ambient `Window` augmentation)
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      },
    },
  ],
};
