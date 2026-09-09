# mneme

Two applications: a NestJS api in `api/`, and a Next.js console in `web/`.

This is the scaffold. It signs in, it scopes what it shows to an organization,
and it has no domain of its own yet — the shape is in place so the first
feature can be about the feature.

## Running it

```sh
pnpm install
cp api/.env.example api/.env
cp web/.env.example web/.env   # then fill in OAUTH_CLIENT_SECRET
./dev.sh
```

| | |
| --- | --- |
| api | <http://localhost:3130> |
| console | <http://localhost:3131> |

`./dev.sh` runs both in watch mode and stops them together — half a running
workspace is the state that wastes the most time, because the half that is
missing looks like a bug in the half that is there. `API_PORT` and `WEB_PORT`
move them.

Sign-in needs **pistis** listening on 3001 (its api) and 3002 (its consent
screen), and a client registered there as `mneme` with the redirect URI
`http://localhost:3131/api/auth/callback`. Without it the console redirects to
a consent screen that is not there.

## api

NestJS 11, on `@aether-zone/organon`. The shared concerns — environment
validation, request ids and a line per request, `/health`, RFC 9457 error
rendering — come from `OrganonModule.forRoot()` rather than being restated
here, so `app.module.ts` holds only what makes this service itself.

```sh
pnpm --filter @mneme/api test        # jest
pnpm --filter @mneme/api typecheck
pnpm --filter @mneme/api build       # nest build → dist/main.js
```

**pistis auth is wired before there is anything to guard.** That is deliberate:
an api that grows its first endpoint with authentication already in place
cannot ship that endpoint unprotected by forgetting to add it. mneme is a
resource server — it verifies tokens against pistis's published keys and
issues, stores and refreshes nothing.

`/health`, `/health/live` and `/health/ready` answer already, and the request
log skips them, since an orchestrator polling every few seconds would otherwise
be most of the log.

## web

Next.js 16 (App Router), `@aether-zone/daimon` for the OAuth client and
`@aether-zone/kosmos` for everything visual.

```sh
pnpm --filter @mneme/web dev
pnpm --filter @mneme/web build
```

The chrome — sidenav, collapsible rail, organization switcher, theme toggle —
matches akouo's and loculus's, so the three consoles read as one product.

Two conventions worth knowing before editing:

- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed it, and the file has to
  sit beside `app/` to be picked up at all. Its `config.matcher` is written out
  as a literal rather than imported, because Next parses that object statically
  at compile time — an imported constant is not recognised.
- **The organization comes from the token, and the cookie is only a
  preference.** `lib/organizations.ts` reads the `orgs` claim pistis put on the
  access token; the switcher's cookie is validated against it on every read, so
  a stale or forged value falls back to a real membership. The api is told which
  organization a request is for through the URL and decides for itself whether
  the token allows it.

## Where the next thing goes

A domain module in `api/src/`, registered in `app.module.ts`. Its screen beside
`web/app/(dashboard)/page.tsx`, and its entry in `web/app/(dashboard)/nav.tsx`
— which has one item today because there is one screen.

`web/lib/api.ts` already resolves every path against the active organization
(`/organizations/{id}/…`), so a new call site does not have to remember to.
