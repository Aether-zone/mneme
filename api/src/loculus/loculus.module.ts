import { ENV } from '@aether-zone/organon';
import { Module } from '@nestjs/common';

import type { Env } from '../env';
import { LoculusClient } from './loculus.client';
import { LOCULUS_CONFIG, type LoculusConfig } from './loculus.config';
import { ServiceToken } from './service-token';

/**
 * Reading objects out of loculus.
 *
 * Its own module rather than providers in `EventsModule`, because the client
 * and its token are configuration-bearing and the listener is not: this is the
 * one place that has to know where loculus is and who mneme is to it.
 */
@Module({
  providers: [
    {
      provide: LOCULUS_CONFIG,
      inject: [ENV],
      useFactory: (env: Env): LoculusConfig => ({
        baseUrl: env.LOCULUS_URL,
        timeoutMs: env.LOCULUS_TIMEOUT_MS,
        /*
         * All three or none. A half-configured client would fail at the first
         * event rather than at boot, which is the wrong end of the day to find
         * out that mneme cannot read anything.
         */
        serviceCredentials:
          env.OAUTH_CLIENT_ID && env.OAUTH_CLIENT_SECRET
            ? {
                // pistis's own path, matching akouo's default for the same server.
                tokenUri:
                  env.OAUTH_TOKEN_URI ?? `${env.OAUTH_ISSUER}/api/oauth/token`,
                clientId: env.OAUTH_CLIENT_ID,
                clientSecret: env.OAUTH_CLIENT_SECRET,
              }
            : undefined,
      }),
    },
    ServiceToken,
    LoculusClient,
  ],
  exports: [LoculusClient],
})
export class LoculusModule {}
