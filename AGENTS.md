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
- D1 for content, leads from the contact form with Kate's status and notes, booking requests and the edit link's token hash, with numbered migrations in `migrations/`. Never edit a migration that is already on `rebuild`; add a new one.
- pnpm, vitest, ESLint. Every job must leave these passing: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `pnpm dev --port <port>` starts the pages and the Worker together with a local D1. On a fresh checkout, run `pnpm db:migrate:local` and then `pnpm seed:local` first.

## Content

- Page content starts as Markdown with front matter in `content/*.md`, one file per `content` row: `about`, `contact`, `cv`, `experience`, `intro` and `site` from the old site, and `numbers`, `new-york`, `message`, `first-call`, `marketing`, `across-company`, `venues` and `closing` for the homepage.
- `draft: true` in a file's front matter marks wording Kate has not approved yet. The seed moves it out of the attributes into the row's `draft` column (`migrations/0002_content_draft.sql`). The page never shows it; it is for the edit screen.
- A nested `draft: true`, as in `cta: { text, draft: true }`, marks just that piece of wording as unapproved. It stays in the attributes, and the row's `draft` column is unchanged.
- `pnpm seed:local` replaces every row of the local `content` table with those files (`scripts/seed-*.ts`). It refuses `--remote` and any other argument.
- `GET /api/content` (`worker/content.ts`) returns `{ [key]: { attributes, content, html, draft } }`, where `html` is the Markdown body rendered and sanitized and `draft` is a boolean. The pages load it once through `ContentProvider` and read it with `useApi()`.
- The numbers strip and the block city format and count Kate's numbers with `src/lib/numbers.ts`.
- Treat stored content as untrusted. Every HTML string that reaches the page goes through `sanitizeHtml` in `src/lib/sanitize-html.ts`; never pass anything else to `dangerouslySetInnerHTML`.

## Contact form

- Questions, options, limits, step order and checks live in `src/lib/contact-form.ts`. The `/contact` page (`src/components/contact/`) and the Worker both import it; never copy them into a component.
- `POST /api/contact` (`worker/contact.ts`) checks, in order: method, `Origin`, body size, the `website` trap field, Turnstile, then `validateAll`. Only then does it store a lead in the `leads` table (`worker/leads.ts`, `migrations/0003_leads.sql`) and send one email to `CONTACT_TO`. The lead stays saved when the email fails. It never stores an IP address, user agent or Turnstile token, and never logs the answers.
- `numbers`, `new-york`, `message` and `venues` each end with a call to action (`src/components/global/NextStep.tsx`, wording in the file's `cta`) that links to `/contact?intent=<intent>&from=<section>`. `SOURCES` in `src/lib/contact-form.ts` is the closed list of `from` values, and `SOURCE_INTENT` fixes each section's intent. `/contact` reads both with `prefillFrom`: a known intent starts on the step after it, and the request sends `from` (or `null` for an unknown one), stored as `from_section`.
- Email goes through `EmailSender` (`worker/email.ts`: `cloudflareEmail`, stand-in `localEmail`) and Turnstile through `TurnstileVerifier` (`worker/turnstile.ts`: `siteverify`, stand-in `localTurnstile`, which accepts only the test token).
- `LOCAL_SERVICES=1` picks the stand-ins (set in `.dev.vars` and the vitest bindings). `CONTACT_TO` is the recipient and `TURNSTILE_SECRET` the Turnstile secret, both Worker secrets. `VITE_TURNSTILE_SITE_KEY` is the page's site key; unset, it uses Cloudflare's always-pass test key.
- When sending fails, the page shows `contact.attributes.email` from `content/contact.md` with a Copy button, or a plain retry message when it is unset.

## Edit link

- Kate's screens are `/edit/<token>` (home), `/edit/<token>/numbers` and `/edit/<token>/sections/<key>` (`src/pages/edit/`, `src/components/edit/`). They cover the eight homepage sections only: the four numbers, every text field, and each section's draft flag.
- They load and save through `/api/edit/<token>/...` (`worker/edit.ts`): `GET /content`, `PUT /numbers` and `PUT /sections/:key`. `requireEditToken` checks the token first; a wrong, missing or too-long token gets the same `{ "error": "not found" }` 404 as any unknown API path. Every edit response carries `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. Never log the token or the request path.
- Section keys, titles, limits, number ranges, locked paths and the checks live in `src/lib/edit-content.ts`, shared by the screens and the Worker like `contact-form.ts`. A section save may change only string leaves of the stored attributes; ids, `kind`, button numbers, photo `src`, the closing `url` and non-string values stay as stored.
- D1 keeps only the token's SHA-256 hash, in the single-row `edit_token` table (`migrations/0004_edit_token.sql`). `worker/edit-token.ts` makes, hashes, compares and stores tokens.
- `pnpm edit-link:local` makes a new token for the local D1, prints `/edit/<token>` once and makes the old link stop working. Like the seed, it refuses `--remote` and any other argument.
- `dev-owner-token` works only when `LOCAL_SERVICES=1`. Anywhere else it is checked against the stored hash like any other token.
- Leads: `/edit/<token>/leads` lists every lead (new ones first, each group newest first) under counts for this calendar month in New York and for each status, with a status filter on the page. `/edit/<token>/leads/<id>` shows every answer in `buildEmail`'s order (`answerPairs` in `src/lib/contact-form.ts`), a "Reply by email" `mailto:` link, a status and private notes to save, and a delete with an on-page confirm. Only the edit home links to them.
- They use `GET /leads`, `GET /leads/:id`, `PUT /leads/:id` (`{ status, notes }` only) and `DELETE /leads/:id` (`worker/edit-leads.ts`), mounted on the `edit` app so the token check and headers run first. An unknown or over-64-character id gets the plain 404. The list leaves out email, answers and notes. Delete is for good: no soft delete or undo.
- Statuses and their labels, `LEAD_LIMITS` (notes up to 5,000 characters, body capped like the other edit saves), `validateLeadUpdate`, `monthStart` and the response types live in `src/lib/leads.ts`. Notes are the `notes` column from `migrations/0005_lead_notes.sql`. Never log a lead's answers, name, email or notes.

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
- A three.js piece loads through a dynamic `import()` only when it nears the viewport, and keeps a still version for reduced motion, missing WebGL or a failed load.
- Outside services are Cloudflare Turnstile, Cloudflare Email Sending and Google Calendar. Tests and local development never call them: use Turnstile's published test keys, and put email and calendar behind small interfaces with a local stand-in that records calls.
- Secrets live in Worker secrets. Commit `.dev.vars.example` with names only.
- Check every input on the server even when the page already checked it.
- Default to no code comments. Keep one only when it says why, not what.
- Do not add Markdown files, plans or notes to the repo. A job's notes go in its job folder.
