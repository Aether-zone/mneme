import { Inject, Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import { z } from 'zod';

import { Misconfigured, ObjectUnreadable } from './errors';
import { LOCULUS_CONFIG, type LoculusConfig } from './loculus.config';
import { ServiceToken } from './service-token';

/**
 * A key is a path — `{requestor}/{organizationId}/{name}` — so each segment is
 * encoded on its own. `encodeURIComponent` on the whole key would turn its
 * slashes into `%2F`, and loculus's wildcard route matches real separators.
 */
const encodeKey = (objectKey: string): string =>
  objectKey.split('/').map(encodeURIComponent).join('/');

const presignedDownloadSchema = z.object({
  objectKey: z.string().min(1),
  downloadUrl: z.url(),
});

/**
 * mneme's client for loculus, the object store service.
 *
 * Read-only, and narrower than the clients in aether and akouo on purpose:
 * mneme stores nothing and deletes nothing, so there is no `createUpload` here
 * to be called by mistake. What it needs is the bytes of an object somebody
 * else uploaded, and it gets them the way any other reader would — ask loculus
 * for a signed URL, then spend it.
 *
 * **Two hops, and only the first is authenticated.** The presign call carries
 * mneme's bearer token; the URL that comes back is itself the credential for
 * the second, which goes straight to the object store and never touches
 * loculus. That is why the timeout applies only to the first: signing is
 * arithmetic, while reading a large object legitimately takes as long as it
 * takes.
 */
@Injectable()
export class LoculusClient {
  private readonly logger = new Logger(LoculusClient.name);

  constructor(
    @Inject(LOCULUS_CONFIG) private readonly config: LoculusConfig,
    private readonly token: ServiceToken,
  ) {}

  /**
   * The object's bytes, as a stream.
   *
   * A stream rather than a buffer because the extractor contract is
   * stream-shaped for exactly this caller: the one place in the workspace where
   * an arbitrarily large file is read by a process that did not receive it.
   */
  async open(objectKey: string): Promise<Readable> {
    const downloadUrl = await this.downloadUrl(objectKey);
    const response = await fetch(downloadUrl);

    if (response.status === 404) {
      /*
       * loculus signed a URL and the store then had nothing behind it. Almost
       * always a deletion between the two hops — the event said the object
       * arrived, and by the time mneme asked, somebody had removed it.
       */
      throw new ObjectUnreadable(
        objectKey,
        'gone',
        'the object was removed before it could be read',
      );
    }

    if (!response.ok || !response.body) {
      throw new Error(
        `The object store answered ${response.status} for "${objectKey}".`,
      );
    }

    return Readable.fromWeb(response.body as never);
  }

  /** Asks loculus for somewhere to read the object from. */
  private async downloadUrl(objectKey: string): Promise<string> {
    const path = `/objects/${encodeKey(objectKey)}/presign`;
    const accessToken = await this.token.get();

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw await this.refusal(objectKey, path, response);
    }

    const parsed = presignedDownloadSchema.safeParse(
      await response.json().catch(() => null),
    );

    if (!parsed.success) {
      throw new Error(
        `loculus answered ${path} with an unusable body: ${parsed.error.message}`,
      );
    }

    return parsed.data.downloadUrl;
  }

  /**
   * Turns loculus's refusal into something the listener can act on.
   *
   * **A 404 here usually is not a missing object.** loculus scopes an object to
   * the OAuth client that presigned its upload and answers 404 rather than 403
   * for somebody else's — deliberately, so that asking cannot confirm a key
   * exists. mneme presigned none of these, so a 404 means either the object is
   * genuinely unknown or mneme's token lacks `objects:read:any`, the scope that
   * lets a service read what another client stored. The two are
   * indistinguishable from here, which is why the message names both and names
   * the scope: somebody chasing "why is nothing being indexed" should find the
   * answer in the log rather than having to guess which case they are in.
   */
  private async refusal(
    objectKey: string,
    path: string,
    response: Response,
  ): Promise<Error> {
    const detail = await response.text().catch(() => '');

    if (response.status === 404) {
      return new ObjectUnreadable(
        objectKey,
        'forbidden',
        'loculus does not offer it to mneme — either there is no such object, ' +
          "or mneme's token lacks the objects:read:any scope, which is what " +
          'lets a service read an object another client uploaded',
      );
    }

    if (response.status === 401 || response.status === 403) {
      /*
       * Not passed off as "not ours": mneme's own token was rejected, which is
       * a configuration fault — an unregistered client, or mneme and loculus
       * disagreeing about the issuer — and every message will fail the same way
       * until somebody fixes it. Loud, and worth retrying, because the fix
       * happens outside this process.
       */
      return new Misconfigured(
        `loculus rejected mneme's token on ${path} (${response.status}): ` +
          `${detail || 'no detail given'}. mneme and loculus likely disagree ` +
          'about the pistis issuer or audience.',
      );
    }

    return new Error(
      `loculus answered ${path} with ${response.status}: ${detail}`,
    );
  }
}
