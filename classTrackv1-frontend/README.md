# ClassTrack AI — Client

Enterprise React frontend for the ClassTrack AI classroom platform.

## Stack

React 19 · Vite 6 · TypeScript (strict) · Material UI 6 · React Router v7 ·
Axios · TanStack Query v5 · React Hook Form · Zod · Zustand (Context API for
theme/session)

## Folder structure

```
src/
  app/         composition root — providers (QueryClient, Theme, Router)
  assets/      static assets (logos, illustrations)
  components/  reusable, presentation-only UI components
  layouts/     role-based shell layouts (nav + sidebar + breadcrumb)
  pages/       route-level page components
  features/    feature-sliced modules (auth, assignments, users, reports…)
  hooks/       cross-cutting reusable hooks
  services/    axios instance, interceptors, typed API clients
  store/       global client state (Zustand)
  theme/       MUI theme tokens, palette, typography, dark mode provider
  types/       shared TypeScript types
  routes/      route table + route guards
  utils/       constants & helpers
```

Each `src/<folder>/README.md` documents that folder's intended contents and
which module introduces it.

## Path aliases

`@/*`, `@app/*`, `@components/*`, `@layouts/*`, `@pages/*`, `@features/*`,
`@hooks/*`, `@services/*`, `@store/*`, `@theme/*`, `@types/*`, `@routes/*`,
`@utils/*` — configured in `tsconfig.app.json` and resolved at build time via
`vite-tsconfig-paths`.

## Getting started

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api/*` requests
to the backend on `http://localhost:5000` (see `vite.config.ts`).

## Scripts

| Command            | Purpose                              |
| ------------------ | ------------------------------------- |
| `npm run dev`       | Start Vite dev server                 |
| `npm run build`     | Type-check + production build         |
| `npm run preview`   | Preview the production build locally  |
| `npm run lint`      | ESLint                                |
| `npm run typecheck` | TypeScript project-wide type checking |

## Module roadmap

- **Module 1 — Application Foundation** ✅ (this module): project scaffold,
  theme system incl. dark mode, providers, route skeleton.
- **Module 2 — Authentication**: JWT login, refresh token flow, Axios
  interceptors, protected/role routes, persistent login, unauthorized /
  forbidden screens.
- **Module 3 — Global UI**: top nav, sidebar, breadcrumb, loading/error
  components, confirmation dialog, notification snackbar wiring.
- **Module 4 — Role Dashboards**: Admin / Teacher / Student layouts and
  dashboard shells.
- **Later**: AI modules (OCR, Groq evaluation, AI reports, analytics,
  multilingual support), AWS deployment.
