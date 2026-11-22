# katefrench.me

Kate French's personal site. It has three jobs: show her sales work at AdmitONE with real numbers, let a visitor contact her and ask for a call, and let Kate change her own content from a private link on her phone.

Reference material sits outside the repo, next to the main checkout, in `../reference/` (from a job's worktree: `<main checkout>/../reference/`). Read `NOTES.md` there first. It points to the approved design concept and to two sibling projects whose patterns this one follows.

## Where the rebuild stands

- `main` is the live site: Next.js 14, static export, deployed to GitHub Pages by `.github/workflows/nextjs.yml`. Leave `main`, `.github/` and `CNAME` alone.
- `rebuild` is the base branch for all new work. The site is being rebuilt there and replaces `main` only when a person decides to launch.
- Nothing on `rebuild` deploys. Never run `wrangler deploy`, and never create or change Cloudflare or Google resources.

## Stack on `rebuild`

- Vite, React 19 and TypeScript for the pages in `src/`; Tailwind and shadcn components in `src/components/ui/`.
- One Cloudflare Worker in `worker/` using Hono. It serves the built pages as static assets and answers `/api/*`.
- D1 for content, booking requests and the edit link's token hash, with numbered migrations in `migrations/`. Never edit a migration that is already on `rebuild`; add a new one.
- pnpm, vitest, ESLint. Every job must leave these passing: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `pnpm dev --port <port>` starts the pages and the Worker together with a local D1. On a fresh checkout, run `pnpm db:migrate:local` and then `pnpm seed:local` first.

## Content

- Page content starts as Markdown with front matter in `content/*.md`, one file per `content` row (`about`, `contact`, `cv`, `experience`, `intro`, `site`).
- `pnpm seed:local` replaces every row of the local `content` table with those files (`scripts/seed-*.ts`). It refuses `--remote` and any other argument.
- `GET /api/content` (`worker/content.ts`) returns `{ [key]: { attributes, content, html } }`, where `html` is the Markdown body rendered and sanitized. The pages load it once through `ContentProvider` and read it with `useApi()`.
- Treat stored content as untrusted. Every HTML string that reaches the page goes through `sanitizeHtml` in `src/lib/sanitize-html.ts`; never pass anything else to `dangerouslySetInnerHTML`.

## Contact form

- Questions, options, limits, step order and checks live in `src/lib/contact-form.ts`. The `/contact` page (`src/components/contact/`) and the Worker both import it; never copy them into a component.
- `POST /api/contact` (`worker/contact.ts`) checks, in order: method, `Origin`, body size, the `website` trap field, Turnstile, then `validateAll`. It sends one email to `CONTACT_TO` and stores nothing.
- Email goes through `EmailSender` (`worker/email.ts`: `cloudflareEmail`, stand-in `localEmail`) and Turnstile through `TurnstileVerifier` (`worker/turnstile.ts`: `siteverify`, stand-in `localTurnstile`, which accepts only the test token).
- `LOCAL_SERVICES=1` picks the stand-ins (set in `.dev.vars` and the vitest bindings). `CONTACT_TO` is the recipient and `TURNSTILE_SECRET` the Turnstile secret, both Worker secrets. `VITE_TURNSTILE_SITE_KEY` is the page's site key; unset, it uses Cloudflare's always-pass test key.
- When sending fails, the page shows `contact.attributes.email` from `content/contact.md` with a Copy button, or a plain retry message when it is unset.

## People

- Visitors: hiring managers and recruiters, and venue owners or event organizers. Most are on a phone and give the page a minute.
- Kate: edits from her phone at `/edit/<token>`. There is no account and no password. The token is stored only as a SHA-256 hash. In local development the token `dev-owner-token` works; it must never work in production.

## Design

- Keep the current look. Tokens (HSL): background `54 100% 93%`, foreground `0 0% 12%`, primary `39 100% 44%`, primary-foreground `54 100% 90%`, secondary `54 100% 85%`, border `54 100% 80%`, muted text `0 0% 42%`, radius `0.5rem`.
- One light theme. No dark theme and no extra accent colors.
- Headings and large numbers: Bricolage Grotesque. Body: Inter.
- The header reads "Kate French ✨". The portrait keeps its arch shape. Photos keep the amber soft-light tint.
- Every page works at 390 px wide, and every screen has a visible way back.

## Content

- Kate's real numbers are in `../reference/NOTES.md`. Never invent a number, a quote, a client name or an email she sent. Where the concept shows a draft or sample, keep it clearly replaceable from the edit screen.
- Write in American English, in short plain sentences, in Kate's first person on the site.

## Conventions

- Dependencies: use what the spec names or what `whereisjohnny.com` already uses for the same job. `three` is allowed for the 3D pieces. Anything else needs the spec to ask for it.
- Outside services are Cloudflare Turnstile, Cloudflare Email Sending and Google Calendar. Tests and local development never call them: use Turnstile's published test keys, and put email and calendar behind small interfaces with a local stand-in that records calls.
- Secrets live in Worker secrets. Commit `.dev.vars.example` with names only.
- Check every input on the server even when the page already checked it.
- Default to no code comments. Keep one only when it says why, not what.
- Do not add Markdown files, plans or notes to the repo. A job's notes go in its job folder.
