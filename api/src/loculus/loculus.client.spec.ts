import { Readable } from 'node:stream';

import { Misconfigured, ObjectUnreadable } from './errors';
import { LoculusClient } from './loculus.client';
import type { LoculusConfig } from './loculus.config';
import type { ServiceToken } from './service-token';

const KEY = 'aether/org-1/a24b27c8-notes.md';

const config: LoculusConfig = {
  baseUrl: 'http://loculus.test',
  timeoutMs: 5_000,
};

/** A `fetch` that answers the presign call and then the store. */
function harness(
  answers: { presign?: Response | Error; object?: Response } = {},
) {
  const presign =
    answers.presign ??
    ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ objectKey: KEY, downloadUrl: 'http://store/get' }),
    } as unknown as Response);

  const object =
    answers.object ??
    ({
      ok: true,
      status: 200,
      body: Readable.toWeb(Readable.from(['bytes'])),
    } as unknown as Response);

  const fetchMock = jest
    .fn()
    .mockImplementationOnce(() =>
      presign instanceof Error
        ? Promise.reject(presign)
        : Promise.resolve(presign),
    )
    .mockImplementationOnce(() => Promise.resolve(object));

  global.fetch = fetchMock as never;

  const token = { get: jest.fn().mockResolvedValue('service-token') };
  const client = new LoculusClient(config, token as unknown as ServiceToken);

  /* Typed, so the assertions can read a call without reaching into `any`. */
  const calls = fetchMock.mock.calls as [string, RequestInit][];

  return { client, calls, token };
}

const refused = (status: number) =>
  ({
    ok: false,
    status,
    text: () => Promise.resolve('no'),
  }) as unknown as Response;

describe('reading an object', () => {
  it('asks loculus to sign a URL, then spends it', async () => {
    const { client, calls, token } = harness();

    const stream = await client.open(KEY);

    expect(token.get).toHaveBeenCalled();
    expect(calls[0][0]).toBe(`http://loculus.test/objects/${KEY}/presign`);
    expect((calls[0][1].headers as Record<string, string>).authorization).toBe(
      'Bearer service-token',
    );
    expect(calls[1][0]).toBe('http://store/get');
    expect(stream).toBeInstanceOf(Readable);
  });

  /*
   * A key is a path, and loculus's route matches real separators. Encoding the
   * whole key would turn them into `%2F` and miss the route entirely.
   */
  it('encodes each key segment but keeps the separators', async () => {
    const { client, calls } = harness();

    await client.open('aether/org 1/a b.md');

    expect(calls[0][0]).toBe(
      'http://loculus.test/objects/aether/org%201/a%20b.md/presign',
    );
  });

  /*
   * loculus answers 404 for another client's object as well as for one that
   * does not exist — deliberately, so asking cannot confirm a key. mneme
   * presigned none of these, so it cannot tell the two apart and must not
   * requeue either.
   */
  it('treats a refusal as final rather than retryable', async () => {
    const { client } = harness({ presign: refused(404) });

    // One call: the harness answers each hop once, as a real exchange does.
    const failure = await client.open(KEY).catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(ObjectUnreadable);
    expect(failure).toMatchObject({ reason: 'forbidden' });
  });

  it('reports a rejected service token as something to fix, not to skip', async () => {
    // mneme's own credentials are wrong or unregistered: every message will
    // fail the same way until somebody changes the configuration.
    const { client } = harness({ presign: refused(401) });

    const failure = await client.open(KEY).catch((cause: unknown) => cause);

    // A misconfiguration, not a skip: every message would fail identically
    // until somebody changes something, so the listener must not requeue it.
    expect(failure).toBeInstanceOf(Misconfigured);
    expect((failure as Error).message).toMatch(/rejected mneme's token/);
  });

  it('gives up on an object deleted between signing and reading', async () => {
    const { client } = harness({ object: refused(404) });

    await expect(client.open(KEY)).rejects.toMatchObject({ reason: 'gone' });
  });
});
