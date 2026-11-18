# Secure Notes — Frontend

Minimal client for the [Secure Notes API](https://github.com/zakirdaq/secure-notes-api). Plain HTML, CSS and
JavaScript built with Vite — no framework, no UI library, no template.

The visual style is deliberately plain: the interview task states the frontend is
not a priority, so this exists to exercise every API endpoint and prove the JWT
and role-based flows work across origins.

## Live

| | |
| --- | --- |
| **Site** | <https://secure-notes-web-iota.vercel.app> |
| **API** | <https://secure-notes-api-nine.vercel.app> — the root lists every endpoint |
| **API repo** | <https://github.com/zakirdaq/secure-notes-api> |

Sign in with `admin@example.com` or `user1@example.com`, password
`Password123!`. The admin sees user management and both aggregation views; the
regular user sees only their own notes.

---

## Quick start

The backend must be running first (see [its README](https://github.com/zakirdaq/secure-notes-api)).

```bash
npm install
cp .env.example .env     # VITE_API_BASE_URL defaults to http://localhost:3000
npm run dev              # http://localhost:5173
```

| Script | Does |
| ------ | ---- |
| `npm run dev` | Dev server on port 5173 (`strictPort`, so it fails rather than drifting) |
| `npm run build` | Static production build into `dist/` |
| `npm run preview` | Serves the built output on port 4173 |

Seeded logins (password `Password123!`):

| Role  | Email             | Sees |
| ----- | ----------------- | ---- |
| admin | admin@example.com | Everything, including both aggregation views |
| user  | user1@example.com | Only their own notes and posts |

---

## Configuration

One variable, in `.env`:

```
VITE_API_BASE_URL=http://localhost:3000
```

The base origin only — no trailing slash and no `/api` suffix, which
[`src/api.js`](src/api.js) appends. Vite inlines `VITE_`-prefixed variables at
**build** time, so a deployed build has its API URL baked in; change it and rebuild.

The current target is shown next to the page heading, which makes a misconfigured
deployment obvious at a glance.

---

## How auth works

The token lives in `localStorage` and is sent as `Authorization: Bearer <token>`.
Nothing uses cookies, and that is a deliberate choice for a two-origin setup:

- no `SameSite` rules to negotiate between `localhost:5173` and `localhost:3000`
- no CSRF token needed, because the browser does not attach the credential automatically
- no `credentials: 'include'`, so the backend's CORS config stays simple

The trade-off: `localStorage` is readable by any JavaScript running on the page,
so it is exposed to XSS. For production I would use a short-lived access token
plus a refresh token in an `httpOnly` cookie — at the cost of needing CSRF
protection and exact-origin CORS with credentials. For this task the header
approach is the right call, and it is what keeps the two projects cleanly separable.

A `401` from any endpoint clears the stored session automatically, so an expired
token returns the user to the login form rather than leaving the UI half-broken.

---

## Layout

```
index.html        markup (Vite entry)
src/api.js        fetch wrapper, token storage, error unwrapping
src/main.js       UI wiring and rendering
src/style.css     styles, including a dark-mode block
vite.config.js    pinned ports
```

`src/api.js` unwraps the API's `{ error: { message, details } }` envelope into a
single readable string, so a validation failure shows as
`email: Invalid email address` rather than a generic "request failed". A network
or CORS rejection is reported distinctly, naming both possible causes — the two
are indistinguishable from the browser's side.

All rendered user content goes through `escapeHtml`, since notes and posts are
free text injected via `innerHTML`.

---

## What it exercises

- Register and login (JWT), with validation errors surfaced per field
- Notes CRUD, paginated — a user sees only their own
- Admin toggle for "all users' notes", which hits the same endpoint unscoped
- Admin user management: list, create (including admins), promote/demote, delete
- **Aggregation Scenario 1** — users grouped by interest, with an optional
  single-interest filter, raw JSON shown so the pipeline output is inspectable
- **Aggregation Scenario 2** — any user's posts via `$lookup`, called without a
  token to demonstrate the endpoint is genuinely public

---

## Deploying

Vercel auto-detects Vite; no `vercel.json` needed.

```bash
npm i -g vercel
vercel --prod
```

Two things must line up, or the browser blocks every request:

1. Set `VITE_API_BASE_URL` to the deployed API origin **before** building.
2. Add this frontend's origin to the API's `CORS_ORIGIN` (comma-separated list).

---

## A note on `npm audit`

`npm audit` reports a high-severity ReDoS advisory in `picomatch`, reached through
Vite's file-watching dependencies. Worth stating plainly rather than hiding:

- The advisory matches **all** published `picomatch` versions — there is no fixed
  release to upgrade to.
- `npm audit fix --force` "resolves" it by downgrading Vite, which does not
  actually fix `picomatch`; it just moves Vite out of the advisory's version range.
- `picomatch` is a build-time glob matcher. It is not in the shipped bundle
  (verified against `dist/`), so no deployed code path reaches it.

So the project stays on current Vite rather than downgrading to improve a number.
