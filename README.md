# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Database setup (one-time, per environment)

The cross-device sync layer (`/api/sync`) stores per-(athlete, key)
JSONB rows in a Vercel Postgres (Neon) database. Provisioning the
database via Vercel automatically injects `POSTGRES_URL`,
`POSTGRES_URL_NON_POOLING`, and `POSTGRES_PRISMA_URL` into the
project's env vars; the schema still has to be applied once per fresh
database:

```bash
# 1. Pull the env vars Vercel injected into this project
vercel env pull .env.local

# 2. Apply the schema (idempotent — re-running is safe)
psql "$(grep '^POSTGRES_URL_NON_POOLING=' .env.local | cut -d= -f2- | tr -d '"')" \
  -f scripts/db/init.sql
```

Use the **non-pooling** URL for DDL like this (the pooled URL goes
through PgBouncer in transaction mode and rejects some DDL). The
serverless functions in `api/sync.py` use the pooled `POSTGRES_URL`
because they're short-lived.

To verify:

```bash
psql "$POSTGRES_URL_NON_POOLING" -c '\dt'
# expect to see user_state in the list
```

Full PR scope, verification matrix, and follow-up roadmap (PR B / C /
D) live in [`docs/pr-a-sync-plan.md`](./docs/pr-a-sync-plan.md).
