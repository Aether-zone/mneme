# mneme

What the workspace remembers.

mneme listens to the same exchange arachni does and embeds what it hears, so a
meeting created in akouo can be found by describing it rather than by knowing
where it was filed. A NestJS api in `api/`, a Next.js console in `web/`.

```
akouo ──meeting.created──▶ aether-zone exchange ──▶ mneme.events queue
                                                          │
                                     aetherEventSchema ────┤ not an Aether event? drop
                                                          │
                                       documentToText ────┤ the words in the document
                                                          │
                                        TextSplitter ─────┤ chunks that fit a model
                                                          │
                                    EmbeddingProvider ────▶ Qdrant
```

arachni consumes that same stream and projects it into a graph. The two are
siblings, not layers: given one document, arachni asks what the edges are and
mneme asks what the words are.

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

## How a document is remembered

**Chunks, not documents.** A model has a token limit, and a vector averaged
over a whole document says very little about any part of it. The passage that
answers a question is what should be findable, not the file it lives in — so
results come back as passages, and the console shows them that way.

**Ids are derived, never random.** A chunk's id is a UUIDv5 of
`organizationId/resourceUri#index`. At-least-once delivery means the same
`ResourceUpdated` arrives twice, and re-indexing has to be a no-op rather than
a second copy: random ids would accumulate a new copy of every document on
every update, and the old copies would go on answering searches for text that
had been edited out. When a document gets *shorter*, the tail from the previous
version is deleted after the new chunks are written.

**The organization is part of the key, not only of the payload.** Resource IRIs
are not globally unique — the ingest endpoint lets a caller name any `uri` —
so a shared key would let one tenant overwrite another's chunks of the same
name. The payload filter keeps a *reader* inside its own tenant; the key keeps
a *writer* there.

## api

NestJS 11, on `@aether-zone/organon`. The shared concerns — environment
validation, request ids and a line per request, `/health`, RFC 9457 error
rendering — come from `OrganonModule.forRoot()` rather than being restated
here, so `app.module.ts` holds only what makes this service itself.

| | |
| --- | --- |
| `GET /organizations/:id/memory/search?q=` | the passages closest to a question |
| `POST /organizations/:id/memory/documents?uri=` | remember a body sent directly |
| `GET /organizations/:id/memory/resources?uri=` | what is remembered of one resource |
| `DELETE /organizations/:id/memory/resources?uri=` | forget it |

Every route is under `/organizations/:organizationId` and guarded by
`OrganizationGuard`, which checks the id against the caller's `orgs` claim. The
handlers take the organization from the `Actor` the guard produces rather than
from the path, so a route that ever loses its guard fails loudly instead of
quietly querying an organization nobody checked.

The ingest endpoint is the manual path. The one that matters is the event
listener: nobody uploads anything, and mneme fills up as the other services
announce things.

### Embedding without a key

**Without `OPENAI_API_KEY`, mneme embeds with a local hashing provider that
matches words rather than meaning.** "car" and "automobile" are as unrelated to
it as "car" and "Thursday" — every claim an embedding is supposed to make is
exactly what it cannot do. It exists because the alternative is a service that
cannot start, be tested, or be demonstrated without a key and a network round
trip per chunk; akouo makes the same trade with its mock transcriber. It warns
at boot. Do not run it in production.

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

## Running the dependencies

Qdrant and RabbitMQ, both from the workspace's root `docker-compose.yml`:

```sh
docker compose up -d qdrant rabbitmq
```

Note the ports: the compose file remaps both away from their defaults, because
6333 and 5672 are commonly taken. **Qdrant is on 6343** (its dashboard at
<http://localhost:6343/dashboard>) and **RabbitMQ on 5682**.

## What is not here yet

**Only text, JSON and Markdown.** `extract/` is where a PDF or an audio
transcript would go; the `Extractor` seam takes a stream precisely so those do
not begin by buffering.

**Nothing fetches a file from loculus.** An object stored there announces
itself, but reading the bytes back to index them is a step that has not been
designed. Today mneme remembers what an event *says* about a resource, not
what the resource contains.
