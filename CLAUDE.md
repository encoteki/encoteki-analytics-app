# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — dev server with HMR at http://localhost:5173
- `npm run build` — production build (outputs `build/client` + `build/server`)
- `npm run start` — serve the production build via `@react-router/serve`
- `npm run typecheck` — runs `react-router typegen` then `tsc` (must regenerate `./.react-router/types` before typecheck)
- `npm run lint` / `npm run lint:fix`
- `npm run format` / `npm run format:check`

No test runner is configured.

## Architecture

React Router 7 app in SSR mode (`react-router.config.ts`), Vite + TailwindCSS v4 (via `@tailwindcss/vite`), React 19. Path alias `~/*` → `./app/*`.

The project is a single-page analytics dashboard for a cross-chain NFT minting dApp (TSB). There is **one route** — `app/routes/home.tsx` (registered in `app/routes.ts` via `index(...)`) — and it owns the entire UI. Do not proliferate routes unless explicitly asked.

### Data flow (important)

The dashboard makes **one** GraphQL request (`fetchAllMints()` in `app/lib/graphql.ts`) and derives everything client-side. This is deliberate — see the comment on `deriveChainStats()`: per-chain and per-token stats are computed from the flat mint list to avoid N+M round-trips. Day buckets come from `deriveDailyMintCounts()`. When adding metrics, prefer another derivation pass over new queries.

- Only mints with `status === 3` (`STATUS_CONFIRMED`) count toward revenue/mintCount.
- Heatmap day boundaries use **GMT+7 (WIB)**, not UTC — `GMT7_OFFSET_MS` in `home.tsx`.
- Revenue = `count(confirmed mints for token+chain) * MINT_PRICES[symbol]`.

### Config (`app/config/index.ts`)

All chain/token/pricing values come from `VITE_*` env vars (see `.env.example`). `APP_ENV=local|prod` switches between `TESTNET_*` and `MAINNET_*` chain IDs and token addresses in one place — adding a new chain or token means updating both maps plus `CHAIN_META`, `TOKEN_ICONS`, and the `ChainKey`/`TokenSymbol` unions. Tokens with a blank address stay in the list (UI only) but are skipped in lookups; `ZERO` (`0x0…0`) represents native ETH.

Helpers `chainKeyById(id)` and `tokenSymbolByAddress(addr, chainKey)` are the canonical way to resolve on-chain identifiers back to UI keys — use them instead of ad-hoc comparisons (addresses are compared lowercase).

### GraphQL

Endpoint is `VITE_GRAPHQL_URL_LOCAL` or `VITE_GRAPHQL_URL_PROD` depending on `APP_ENV`. All query strings live in `app/lib/graphql.ts` and mirror the shapes in `GRAPHQL.md`. `gqlFetch` throws on network errors, GraphQL `errors[]`, or missing `data` — callers expect thrown errors, not nullable returns.

### Styling

TailwindCSS v4 utility-first; no component library. Design direction in `.impeccable.md` — light-mode-only, minimal financial aesthetic, data-first. Fonts: Inter via Google Fonts (preconnected in `root.tsx`).

## Conventions

- Prettier enforces: **no semicolons**, **double quotes**, `printWidth: 88`, `trailingComma: es5`, 2-space indent, LF.
- ESLint: `@typescript-eslint/no-unused-vars` ignores `^_`-prefixed names; `no-explicit-any` is a warning.
- TS is `strict` with `verbatimModuleSyntax` — use `import type { … }` for type-only imports.
- Commit style from history: `feat(scope): …`, `fix(scope): …`, `chore: …`, `style: …` (scope often `tsb`).
