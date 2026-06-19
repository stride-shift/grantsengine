# d-lab Grant Engine

AI-assisted grant-pipeline management for [d-lab NPC](https://) — a React 18 + Vite frontend, an Express 5 API backed by Supabase PostgreSQL, and a separate Playwright service.

## Quick start

```bash
npm install
npm run dev      # Vite dev server (proxies API calls to the Express backend on :3001)
```

Copy `.env.example` to `.env` and fill in the required keys before running the backend.

## Documentation

This project uses an `.org`-based documentation system. **Start with [`README.org`](./README.org)** — it is the navigation hub and links to everything else:

| Doc | Covers |
|-----|--------|
| [`README.org`](./README.org) | Navigation hub, project tree, quick start |
| [`ARCHITECTURE.org`](./ARCHITECTURE.org) | System design, tech stack, data flow, key decisions |
| [`PRODUCT_CONTEXT.org`](./PRODUCT_CONTEXT.org) | Domain, users, financial model, intentional design decisions |
| [`DEFERRED.org`](./DEFERRED.org) | Known gaps, parked work, deferred backlog |

Per-service `README.org` / `ARCHITECTURE.org` and per-module `quick_reference.org` files live throughout `src/` and `server/`. The documentation standard itself is in [`DOCUMENTATION.org`](./DOCUMENTATION.org).
