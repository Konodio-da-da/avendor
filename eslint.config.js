import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist', 'dist-server', 'node_modules'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: ['./tsconfig.app.json', './server/tsconfig.json'] },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
]
