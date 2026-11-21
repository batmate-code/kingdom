// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** Какие пакеты запрещено импортировать из данного: зависимости идут только сверху вниз. */
const forbidden = {
  data: ['core', 'bots', 'sim', 'web'],
  core: ['bots', 'sim', 'web'],
  bots: ['sim', 'web'],
  sim: ['web'],
  web: ['sim'],
};

const uiLibs = ['react', 'react-dom', 'zustand'];

const boundaryRules = Object.entries(forbidden).map(([pkg, banned]) => ({
  files: [`packages/${pkg}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: banned.flatMap((b) => [`@vampire/${b}`, `@vampire/${b}/*`]),
            message: 'Граница пакетов: зависимости идут только сверху вниз (см. CLAUDE.md).',
          },
          {
            group: ['../../*'],
            message:
              'Не импортируйте файлы другого пакета по относительному пути — только через @vampire/*.',
          },
          ...(pkg === 'data' || pkg === 'core'
            ? [{ group: uiLibs, message: 'data и core ничего не знают об интерфейсе.' }]
            : []),
        ],
      },
    ],
  },
}));

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'sim-output/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  ...boundaryRules,
  {
    // Детерминизм: в data/core/bots вся случайность — только через генератор с seed.
    files: ['packages/{data,core,bots}/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Используйте генератор с seed.' },
        { object: 'Date', property: 'now', message: 'Ядро не зависит от времени.' },
      ],
    },
  },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
