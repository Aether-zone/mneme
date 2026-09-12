import { baseEnvSchema } from '@aether-zone/organon';
import { z } from 'zod';

/**
 * What mneme needs, on top of the `NODE_ENV`, `PORT` and `LOG_LEVEL` every
 * service in the workspace has.
 *
 * `PORT` is redeclared only to move the default: organon's base schema defaults
 * it to 3000, and the workspace has 3130 set aside for this api.
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
   * Where pistis publishes its public signing keys. Derived from the issuer per
   * RFC 8414 when unset, which is what a normal deployment wants.
   */
  OAUTH_JWKS_URI: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;
