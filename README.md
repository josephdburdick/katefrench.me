Website for Kate French

Vite, React and TypeScript pages served by a Cloudflare Worker (Hono) with a D1 database. Page content lives in `content/*.md` and is loaded into the local database by a seed script.

## Getting started

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm seed:local
pnpm dev --port <port>
```

In `.dev.vars`, set `LOCAL_SERVICES=1` and any `CONTACT_TO`, so the contact form uses local stand-ins for email and Turnstile. Then open `http://localhost:<port>`.

To edit content, open `http://localhost:<port>/edit/dev-owner-token` (it works only with `LOCAL_SERVICES=1`), or run `pnpm edit-link:local` for a real edit link.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
