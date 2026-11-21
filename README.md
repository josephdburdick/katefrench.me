Website for Kate French

Vite, React and TypeScript pages served by a Cloudflare Worker (Hono) with a D1 database. Page content lives in `content/*.md` and is loaded into the local database by a seed script.

## Getting started

```bash
pnpm install
pnpm db:migrate:local
pnpm seed:local
pnpm dev --port <port>
```

Then open `http://localhost:<port>`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
