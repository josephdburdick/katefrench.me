# katefrench.me

Kate French's personal site. It has three jobs: show her sales work at AdmitONE with real numbers, let a visitor contact her and ask for a call, and let Kate change her own content from a private link on her phone.

Reference material sits outside the repo, next to the main checkout, in `../reference/` (from a job's worktree: `<main checkout>/../reference/`). Read `NOTES.md` there first. It points to the approved design concept and to two sibling projects whose patterns this one follows.

## Where the rebuild stands

- `main` is the live site: Next.js 14, static export, deployed to GitHub Pages by `.github/workflows/nextjs.yml`. Leave `main`, `.github/` and `CNAME` alone.
- `rebuild` is the base branch for all new work. The site is being rebuilt there and replaces `main` only when a person decides to launch.
- `rebuild` has one deployment: a preview Worker, `katefrench-preview`, on its `workers.dev` address with its own D1 database (`env.preview` in `wrangler.jsonc`). Only a person deploys it, with `pnpm deploy:preview`. It uses Turnstile's test keys and sends lead email to a verified address. The live domain is untouched.
- Agents and factory jobs never run `wrangler deploy` or `pnpm deploy:preview`, and never create or change Cloudflare or Google resources.

## Stack on `rebuild`

- Vite, React 19 and TypeScript for the pages in `src/`; Tailwind and shadcn components in `src/components/ui/`.
- One Cloudflare Worker in `worker/` using Hono. It serves the built pages as static assets and answers `/api/*`.
- D1 for content, leads from the contact form with Kate's status and notes, booking requests and the edit link's token hash, with numbered migrations in `migrations/`. Never edit a migration that is already on `rebuild`; add a new one.
- pnpm, vitest, ESLint. Every job must leave these passing: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `pnpm dev --port <port>` starts the pages and the Worker together with a local D1. On a fresh checkout, run `pnpm db:migrate:local` and then `pnpm seed:local` first.

## Content

- Page content starts as Markdown with front matter in `content/*.md`, one file per `content` row: `about`, `contact`, `cv`, `experience`, `intro` and `site` from the old site, and `numbers`, `new-york`, `message`, `first-call`, `marketing`, `venues` and `closing` for the homepage.
- `draft: true` in a file's front matter marks wording Kate has not approved yet. The seed moves it out of the attributes into the row's `draft` column (`migrations/0002_content_draft.sql`). The page never shows it; it is for the edit screen.
- A nested `draft: true`, as in `cta: { text, draft: true }`, marks just that piece of wording as unapproved. It stays in the attributes, and the row's `draft` column is unchanged.
- `pnpm seed:local` replaces every row of the local `content` table with those files (`scripts/seed-*.ts`). It refuses `--remote` and any other argument.
- `GET /api/content` (`worker/content.ts`) returns `{ [key]: { attributes, content, html, draft } }`, where `html` is the Markdown body rendered and sanitized and `draft` is a boolean. The pages load it once through `ContentProvider` and read it with `useApi()`.
- The numbers strip and the block city format and count Kate's numbers with `src/lib/numbers.ts`.
- Treat stored content as untrusted. Every HTML string that reaches the page goes through `sanitizeHtml` in `src/lib/sanitize-html.ts`; never pass anything else to `dangerouslySetInnerHTML`.

## Contact form

- Questions, options, limits, step order and checks live in `src/lib/contact-form.ts`. The `/contact` page (`src/components/contact/`) and the Worker both import it; never copy them into a component.
- The steps are `intent`, `details`, `message`, `call` ("Want to talk it through?") and `reply`. On `call` the visitor picks an open time from `/api/availability` or "No call, just email me" (`time` is `NO_CALL`). With no open times, only "No call" is offered, already selected.
- `POST /api/contact` (`worker/contact.ts`) checks, in order: method, `Origin`, body size, the `website` trap field, Turnstile, then `validateAll`. With a time, it then recomputes the open times and refuses any time not in the list with a `time` field error. Only then does it store a lead in the `leads` table (`worker/leads.ts`, `migrations/0003_leads.sql`), with a time also a pending booking request, and send one email to `CONTACT_TO` with the call line and, for a stored request, the Confirm and Decline links. The lead stays saved when the email fails. It never stores an IP address, user agent or Turnstile token, and never logs the answers or tokens. A request without `time` counts as no call.
- `numbers`, `new-york`, `message` and `venues` each end with a call to action (`src/components/global/NextStep.tsx`, wording in the file's `cta`) that links to `/contact?intent=<intent>&from=<section>`. `SOURCES` in `src/lib/contact-form.ts` is the closed list of `from` values, and `SOURCE_INTENT` fixes each section's intent. `/contact` reads both with `prefillFrom`: a known intent starts on the step after it, and the request sends `from` (or `null` for an unknown one), stored as `from_section`.
- Two limits guard the public routes. `rateLimit` (`worker/rate-limit.ts`) runs on `/api/*` except content and the edit screens: per visitor address and per minute it allows 5 posts (`SUBMIT_LIMIT`) and 60 page loads (`READ_LIMIT`), both `ratelimits` bindings in `wrangler.jsonc`, and answers 429 `busy`. It skips a request with no `CF-Connecting-IP` and never stores the address. Separately, `/api/contact` answers 429 `busy` once `HOURLY_LEAD_CAP` leads were stored in the last hour, whoever sent them.
- `/privacy` (`src/pages/PrivacyPage.tsx`) renders `content/privacy.md`, and the footer and the form's last step link to it. Update that file whenever the site starts collecting, storing or sending something new.
- Email goes through `EmailSender` (`worker/email.ts`: `cloudflareEmail`, stand-in `localEmail`) and Turnstile through `TurnstileVerifier` (`worker/turnstile.ts`: `siteverify`, stand-in `localTurnstile`, which accepts only the test token).
- `LOCAL_SERVICES=1` picks the stand-ins for email, Turnstile and the calendar (`worker/services.ts`; set in `.dev.vars` and the vitest bindings). `CONTACT_TO` is the recipient, `TURNSTILE_SECRET` the Turnstile secret, and `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` the Google Calendar credentials, all Worker secrets. `VITE_TURNSTILE_SITE_KEY` is the page's site key; unset, it uses Cloudflare's always-pass test key.
- When sending fails, the page shows `contact.attributes.email` from `content/contact.md` with a Copy button, or a plain retry message when it is unset.

## Booking

- The calendar sits behind `Calendar` in `worker/calendar.ts`: `busy(from, to)` returns busy intervals only, and `createEvent` returns a video link. The stand-in `localCalendar` is busy 12:00 to 13:00 New York time each day plus every event it created, and records them in `created`. Outside `LOCAL_SERVICES=1`, `googleCalendar` (`worker/google-calendar.ts`) reads FreeBusy and inserts a primary-calendar event with a Meet link and `sendUpdates=all`, using only the two scopes in `GOOGLE_SCOPES` (`calendar.freebusy` and `calendar.events`). `GOOGLE_BUSY_CALENDARS` (a Worker secret, comma-separated calendar IDs) adds calendars shared with that account, such as a work calendar, to the FreeBusy check; events still go only on the primary calendar, and when any listed calendar can't be read the check fails, so the site offers no times instead of wrong ones. `servicesFor` picks it when all three Google secrets are set and keeps one instance per isolate; when any is missing or blank the calendar is `null`, so the site offers only "No call". The access token lives only in memory, and every error carries a step `code` (`google-token`, `google-freebusy`, `google-event`) and no secrets.
- `openTimes` in `worker/availability.ts` is the open-time math: the weekdays, hours, call length, notice and time zone from the one `booking_settings` row (`migrations/0006_booking.sql`), a 14-day window from now, and no overlap with busy times. It converts wall time with `Intl` only.
- `GET /api/availability` returns `{ times, minutes }` and nothing else from the calendar, or no times when the calendar is missing or fails.
- A request is a `booking_requests` row with two single-use tokens, Confirm and Decline. Only their SHA-256 hashes are stored. `/api/booking/:token` (`worker/booking.ts`) shows a request on GET without changing it, and confirms or declines it on POST (same `Origin` rule as the contact form, `worker/origin.ts`). Confirm re-checks the calendar, creates the event, sets the lead to `call-booked` (the `LeadStatus` from `src/lib/leads.ts`, so the leads inbox shows it as "Call booked") and emails the visitor; when the time is no longer free it answers `taken` and the request stays pending. Once either link is used, both answer `used`. Deleting a lead from the inbox deletes its requests too (`ON DELETE CASCADE`), and their links then answer `used`.
- Kate opens the links at `/booking/:token` (`src/pages/BookingPage.tsx`), which acts only when she presses the button.
- From either link Kate can also suggest another time: a POST with `suggest` (one of her open times) and an optional `note` (up to `BOOKING_NOTE_MAX` characters) marks the request declined, stores a `booking_suggestions` row (`migrations/0007_booking_suggestions.sql`) with one single-use token, hash only, and emails the visitor the time, the note and a link to `/booking/time/:token` (`src/pages/SuggestionPage.tsx`). A decline takes the same optional note.
- `/api/booking/time/:token` shows the suggestion on GET. A POST accepts it, which books the call exactly like Confirm and emails both people, or with `pick` (another open time) replaces it with a new pending request and emails Kate fresh Confirm and Decline links. A time that is no longer free answers `taken` and leaves the suggestion open.

## Edit link

- Kate's screens are `/edit/<token>` (home), `/edit/<token>/numbers` and `/edit/<token>/sections/<key>` (`src/pages/edit/`, `src/components/edit/`). They cover the homepage only: the introduction (`intro`) and the seven sections, with the four numbers, every text field, and each section's draft flag.
- They load and save through `/api/edit/<token>/...` (`worker/edit.ts`): `GET /content`, `PUT /numbers` and `PUT /sections/:key`. `requireEditToken` checks the token first; a wrong, missing or too-long token gets the same `{ "error": "not found" }` 404 as any unknown API path. Every edit response carries `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. Never log the token or the request path.
- Section keys, titles, limits, number ranges, locked paths and the checks live in `src/lib/edit-content.ts`, shared by the screens and the Worker like `contact-form.ts`. A section save may change only string leaves of the stored attributes; ids, `kind`, button numbers, photo `src`, the intro and closing `url` and non-string values stay as stored.
- Resume: `/edit/<token>/resume` (`src/pages/edit/EditResume.tsx`) is the one screen where Kate adds, deletes and reorders: sections of the `cv` row, and the dated entries inside a section. It loads and saves through `GET` and `PUT /resume` (`worker/edit-resume.ts`). `src/lib/edit-resume.ts` holds the limits, the check and the two conversions between the stored `sections` and what the screen sends: a section is `text` or `list`, an entry has a title, a place, a start year, an end year or `null` for current, and points. A save rewrites `sections` whole and writes every entry as `role`, `location`, `date` and `details`.
- `FLEX_LISTS` in `src/lib/edit-content.ts` names the homepage lists Kate may reorder and shorten from a section's screen, with the same three-dot menu as the resume (`src/components/edit/ItemMenu.tsx`): the message's paragraphs and its notes, the retention steps, the marketing cards and their tags, the recommendations (`marketing.quotes`, up to four, shown two across) and the venue roles. A list with an `item` there can also grow. One without, like the roles, accepts only its stored entries, so each photo stays with its role. Every other list keeps its length and order.
- The marketing section shows only the cards and recommendations that have text, and the message only the notes and paragraphs that do. The notes are a plain numbered list; nothing ties a note to a sentence of the message.
- `new-york`, `message`, `marketing`, `venues` and `first-call` (under `steps`) each carry a `subheading` next to the heading. `SectionHeading` (`src/components/global/SectionHeading.tsx`) renders it only when it has text.
- A change to the stored shape of a section ships with a migration that reshapes the saved rows and keeps Kate's wording, like `migrations/0008_message_list_and_subheadings.sql`, because the edit screen and its checks follow the stored shape.
- D1 keeps only the token's SHA-256 hash, in the single-row `edit_token` table (`migrations/0004_edit_token.sql`). `worker/edit-token.ts` makes, hashes, compares and stores tokens.
- `pnpm edit-link:local` makes a new token for the local D1, prints `/edit/<token>` once and makes the old link stop working. Like the seed, it refuses `--remote` and any other argument.
- `dev-owner-token` works only when `LOCAL_SERVICES=1`. Anywhere else it is checked against the stored hash like any other token.
- Leads: `/edit/<token>/leads` lists every lead (new ones first, each group newest first) under counts for this calendar month in New York and for each status, with a status filter on the page. `/edit/<token>/leads/<id>` shows every answer in `buildEmail`'s order (`answerPairs` in `src/lib/contact-form.ts`), except the call time, which the lead doesn't store, a "Reply by email" `mailto:` link, a status and private notes to save, and a delete with an on-page confirm. Only the edit home links to them.
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
- Link to another page of the site with `SiteLink` (`src/components/global/SiteLink.tsx`), or a react-router `Link` with `viewTransition` on the edit screens, never a bare `<a href="/...">`: they change page on the client with the view transition in `src/index.css`, and `SiteLink` scrolls smoothly to a `#fragment`. The header, the footer and each page's one `<main>` carry the transition names, so every page keeps exactly one `<main>`. `Root` in `src/router.tsx` sets `data-nav` from the change in path depth and restores scroll. Links out of the edit screens reload the page, because content loads once per page load.
- Outside services are Cloudflare Turnstile, Cloudflare Email Sending and Google Calendar. Tests and local development never call them: use Turnstile's published test keys, and put email and calendar behind small interfaces with a local stand-in that records calls.
- Secrets live in Worker secrets. Commit `.dev.vars.example` with names only.
- Check every input on the server even when the page already checked it.
- Default to no code comments. Keep one only when it says why, not what.
- Do not add Markdown files, plans or notes to the repo. A job's notes go in its job folder.
