import {
  ENV,
  jwksUriFor,
  OrganonModule,
  PistisAuthModule,
} from '@aether-zone/organon';
import { Module } from '@nestjs/common';

import { envSchema, type Env } from './env';

/**
 * mneme's api.
 *
 * Everything the workspace's services share — environment validation, the
 * request log, the health probes, RFC 9457 error rendering — comes from
 * organon rather than being restated here. What is left is what makes this
 * service itself, which for now is nothing: mneme has no domain modules yet.
 */
@Module({
  imports: [
    OrganonModule.forRoot({
      config: { schema: envSchema },
      logging: { base: { service: 'mneme' } },
    }),

    /*
     * Identity comes from pistis. This registers mneme as a resource server
     * for it — tokens are verified against pistis's published keys, and
     * nothing here issues, stores or refreshes a credential.
     *
     * Registered before there is anything to guard on purpose: an api that
     * grows its first endpoint with authentication already wired cannot ship
     * that endpoint unprotected by omission.
     */
    PistisAuthModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        issuer: env.OAUTH_ISSUER,
        audience: env.OAUTH_AUDIENCE ?? env.OAUTH_ISSUER,
        jwksUri: env.OAUTH_JWKS_URI ?? jwksUriFor(env.OAUTH_ISSUER),
      }),
    }),
  ],
})
export class AppModule {}
