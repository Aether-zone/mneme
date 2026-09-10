import { baseEnvSchema } from '@aether-zone/organon';
import { z } from 'zod';

/**
 * What mneme needs, on top of the `NODE_ENV`, `PORT` and `LOG_LEVEL` every
 * service in the workspace has.
 *
 * `PORT` is redeclared only to move the default: organon's base schema
 * defaults it to 3000, and the workspace has 3130 set aside for this api.
 */
export const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3130),

  /*
   * Identity is delegated to pistis, the aether-zone authorization server.
   * mneme is a resource server: it verifies the access tokens it is handed and
   * issues, stores and refreshes nothing. There is no account table here.
   */

  /** Public origin of pistis. Must equal the `iss` claim of its tokens exactly. */
  OAUTH_ISSUER: z.url().default('http://localhost:3001'),
  /**
   * `aud` every accepted token must carry. pistis defaults its audience to its
   * own issuer, so this defaults to OAUTH_ISSUER rather than to a literal.
   */
  OAUTH_AUDIENCE: z.string().min(1).optional(),
  /**
   * Where pistis publishes its public signing keys. Derived from the issuer
   * per RFC 8414 when unset, which is what a normal deployment wants.
   */
  OAUTH_JWKS_URI: z.url().optional(),

  /*
   * Qdrant, where the embedded chunks live. The workspace compose file
   * publishes it on 6343 — 6333 is the container's port, remapped because the
   * default is commonly taken.
   */
  QDRANT_URL: z.url().default('http://localhost:6343'),
  /** Only needed for a Qdrant that requires one; the local container does not. */
  QDRANT_API_KEY: z.string().min(1).optional(),
  /**
   * The collection. One holds every tenant, with `organizationId` filtered on
   * each query — changing this name starts an empty memory rather than
   * migrating the old one.
   */
  MNEME_COLLECTION: z.string().min(1).default('mneme'),

  /*
   * Embedding.
   *
   * Without an API key mneme embeds locally with a hashing provider that
   * matches *words* rather than meaning. That keeps the service runnable and
   * testable with no network, and it is not good enough for production — the
   * boot log says so when it happens.
   */
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Changing this invalidates every vector already stored: it is a re-index. */
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),

  /** Characters per chunk, and how much of the previous each one repeats. */
  CHUNK_SIZE: z.coerce.number().int().positive().default(1000),
  CHUNK_OVERLAP: z.coerce.number().int().min(0).default(200),

  /*
   * RabbitMQ.
   *
   * **The broker is shared, not per-service.** Every aether-zone service
   * publishes to one exchange, which is the only arrangement in which an event
   * from akouo reaches a consumer here. The default matches the workspace
   * compose file, credentials included, because a default that cannot connect
   * to the workspace's own broker is not a useful default.
   */
  RABBITMQ_URI: z
    .string()
    .min(1)
    .default('amqp://aether-zone:Ch4nG3M3!@localhost:5682'),
  /** The shared topic exchange. Must match every other service's. */
  RABBITMQ_EXCHANGE: z.string().min(1).default('aether-zone'),
  /**
   * Wait this long for the broker before finishing the boot, in milliseconds.
   * `0` starts anyway and connects in the background.
   *
   * mneme waits. A projector that starts without its subscription looks
   * healthy while remembering nothing, and the events it misses are not
   * replayed — the durable queue only holds what was published after it
   * existed.
   */
  RABBITMQ_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
});

export type Env = z.infer<typeof envSchema>;
