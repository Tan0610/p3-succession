// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'web/dist', '.secrets', 'handoffs/rehearsals'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // src/core is shared with the browser. It must never touch the filesystem, the
    // process environment or key files: keys only ever enter through src/node/keys.ts.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'os', 'child_process'], message: 'src/core must stay browser-safe.' },
            { group: ['../node/*', '**/src/node/*'], message: 'src/core must not depend on the Node layer.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', { name: 'process', message: 'src/core must not read the environment.' }],
    },
  },
  {
    // The web UI is a read-only viewer: it may not import anything that loads keys.
    files: ['web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/src/node/*', '**/cli/*', '**/scripts/*'], message: 'The web UI never loads keys.' }] },
      ],
    },
  },
)
