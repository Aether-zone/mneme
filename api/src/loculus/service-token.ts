import { Inject, Injectable } from '@nestjs/common';

import { Misconfigured } from './errors';
import { LOCULUS_CONFIG, type LoculusConfig } from './loculus.config';

/** Renew this long before expiry, so a token never expires mid-request. */
const RENEW_BEFORE_MS = 30_000;

/**
 * mneme's own access token, obtained by client credentials.
 *
 * Every other service borrows the caller's token for loculus and is right to:
 * one identity crosses the hop, and the service can obtain nothing the person
 * could not. mneme has no such option — indexing begins when an event arrives,
 * with no request in flight and nobody's token to relay — so it acts as itself
 * and says so.
 *
 * Cached until shortly before expiry, and a burst of deliveries waking at once
 * shares one in-flight request rather than each asking pistis. A *failure* is
 * not cached: pistis being briefly unreachable should cost a retry, not every
 * message until the process restarts.
 *
 * **No `scope` is requested, deliberately.** pistis grants a client its whole
 * registered set when the request names none, and refuses `invalid_scope` for
 * anything it names that is not registered. So asking for `objects:read:any`
 * here would turn a client registered without it from "reads nothing" into
 * "cannot get a token at all", and asking for nothing means the grant is
 * administered where clients are administered. What mneme may read is a
 * question for the client registration, not for this file.
 */
@Injectable()
export class ServiceToken {
  private cached: { token: string; expiresAt: number } | null = null;
  private inFlight: Promise<string> | null = null;

  constructor(@Inject(LOCULUS_CONFIG) private readonly config: LoculusConfig) {}

  async get(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.token;
    }

    this.inFlight ??= this.request().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async request(): Promise<string> {
    const credentials = this.config.serviceCredentials;

    if (!credentials) {
      throw new Misconfigured(
        'mneme has no service credentials, so it cannot read objects from ' +
          'loculus — there is no caller to borrow a token from. Set ' +
          'OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET, and register the client ' +
          'in pistis for the client_credentials grant with the ' +
          'objects:read:any scope.',
      );
    }

    const response = await fetch(credentials.tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');

      /*
       * A 4xx is pistis saying these credentials are wrong: an unregistered
       * client, a bad secret, a grant it may not use. Nothing retries into
       * existence, so it is raised as a misconfiguration and the message is
       * dropped rather than redelivered for ever.
       *
       * A 5xx is pistis being unwell, which is exactly what a retry is for —
       * as is a connection failure, which never reaches here at all because
       * `fetch` throws.
       */
      if (response.status < 500) {
        throw new Misconfigured(
          `pistis refused mneme's client credentials (${response.status}): ` +
            `${detail || 'no detail given'}`,
        );
      }

      throw new Error(
        `pistis could not issue a token (${response.status}): ` +
          `${detail || 'no detail given'}`,
      );
    }

    const body = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };

    if (typeof body.access_token !== 'string') {
      throw new Error('pistis returned no access token.');
    }

    const lifetime =
      typeof body.expires_in === 'number' ? body.expires_in : 3600;

    this.cached = {
      token: body.access_token,
      expiresAt: Date.now() + lifetime * 1000 - RENEW_BEFORE_MS,
    };

    return body.access_token;
  }
}
