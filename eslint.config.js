import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The codebase already marks a deliberately-unused parameter by
      // prefixing it `_` (`_athleteId`, `_trainingState`, `_elevationGainFt`)
      // — kept in the signature because it documents the contract the caller
      // fills. The linter just did not know the convention, so it reported
      // each one as an error. Teaching it the convention is the fix; deleting
      // the parameters would change those signatures to say less.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Legibility floor. 8px and 9px type shipped across 14 components and
      // was unreadable on a phone in daylight; nothing below 10px goes back in.
      // Applies to both plain className strings and template literals.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/text-\\[[0-9]px\\]/]",
          message: 'Type below 10px is not legible on a phone — use text-[10px] or larger.',
        },
        {
          selector: "TemplateElement[value.raw=/text-\\[[0-9]px\\]/]",
          message: 'Type below 10px is not legible on a phone — use text-[10px] or larger.',
        },
      ],
    },
  },
  {
    // Initiative 003: the landing page must not import app code, recharts or
    // cesium (design-spec.md § Files). The rule matches the import string,
    // not the resolved path, so the page's own ./components and ../components
    // imports are re-allowed by negation. scripts/deploy/check-site-layout.mjs
    // is the backstop: it reads what actually shipped.
    files: ['src/landing/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '**/App', '**/App.tsx',
            '**/engines/**', '**/hooks/**', '**/utils/**', '**/data/**', '**/components/**',
            '!./components/**', '!../components/**',
            'recharts', 'recharts/**', 'cesium', 'cesium/**',
          ],
          message: 'The landing page may not import app code, recharts or cesium (initiative 003). Duplicate the few lines you need, and test them.',
        }],
      }],
    },
  },
])
