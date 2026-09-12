import { Nack } from '@golevelup/nestjs-rabbitmq';
import { Readable } from 'node:stream';

import { ExtractorRegistry } from '../extract/extractor.registry';
import { JsonExtractor } from '../extract/json.extractor';
import { TextExtractor } from '../extract/text.extractor';
import { Misconfigured, ObjectUnreadable } from '../loculus/errors';
import type { LoculusClient } from '../loculus/loculus.client';
import type { MemoryService } from '../memory/memory.service';
import { ObjectUploadedListener } from './object-uploaded.listener';

const KEY = 'aether/org-1/a24b27c8-notes.md';

/** The bit of the AMQP delivery the listener reads: has this been tried yet. */
const delivery = (redelivered: boolean) => ({ fields: { redelivered } });

/** The event as loculus publishes it, envelope included. */
const event = (over: Record<string, unknown> = {}) => ({
  objectKey: KEY,
  name: 'notes.md',
  contentType: 'text/markdown',
  size: 24,
  organizationId: 'org-1',
  id: 'c0ffee00-0000-4000-8000-000000000000',
  occurredAt: '2026-09-12T06:24:19.011Z',
  ...over,
});

/**
 * Real extractors, stubbed edges.
 *
 * The registry is the thing being asked a question here — "does mneme read
 * this?" — so stubbing it would stub the decision under test. loculus and the
 * memory are stubbed: one is a network and the other is a vector store.
 */
function harness(
  over: {
    open?: jest.Mock;
    index?: jest.Mock;
  } = {},
) {
  const extractors = new ExtractorRegistry([
    new TextExtractor(),
    new JsonExtractor(),
  ]);

  const open =
    over.open ?? jest.fn().mockResolvedValue(Readable.from(['# Notes\n\nhi']));
  const index = over.index ?? jest.fn().mockResolvedValue({ chunks: 1 });

  const listener = new ObjectUploadedListener(
    extractors,
    { open } as unknown as LoculusClient,
    { index } as unknown as MemoryService,
  );

  return { listener, open, index };
}

describe('ObjectUploadedListener', () => {
  it('reads an uploaded document and remembers it', async () => {
    const { listener, open, index } = harness();

    await expect(listener.handle(event())).resolves.toBeUndefined();

    expect(open).toHaveBeenCalledWith(KEY);
    expect(index).toHaveBeenCalledWith(
      'org-1',
      `urn:aether:object:${KEY}`,
      '# Notes\n\nhi',
      {
        metadata: {
          objectKey: KEY,
          contentType: 'text/markdown',
          filename: 'notes.md',
          size: 24,
          source: 'loculus',
        },
      },
    );
  });

  /*
   * The whole point of checking the type first: the bucket is mostly other
   * services' recordings and images, and fetching one to discover mneme cannot
   * read it would be a download per upload for nothing.
   */
  it('leaves a type nothing reads alone, without fetching it', async () => {
    const { listener, open, index } = harness();

    const result = await listener.handle(
      event({ contentType: 'audio/mpeg', name: 'standup.mp3' }),
    );

    expect(result).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
    expect(index).not.toHaveBeenCalled();
  });

  it('reads a type whose content type carries parameters', async () => {
    const { listener, index } = harness();

    await listener.handle(
      event({ contentType: 'text/markdown; charset=utf-8' }),
    );

    expect(index).toHaveBeenCalled();
  });

  /*
   * Remembering under a guessed tenant would put one organization's document
   * into another's search results — worse than not indexing it at all.
   */
  it('refuses to file an object that names no organization', async () => {
    const { listener, index } = harness();

    const result = await listener.handle(event({ organizationId: null }));

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(index).not.toHaveBeenCalled();
  });

  it('drops a message that is not this event rather than requeuing it', async () => {
    const { listener, open } = harness();

    const result = await listener.handle({ objectKey: 42 });

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  /*
   * No redelivery makes an object readable that loculus will not hand over —
   * whether it was deleted or belongs to a client mneme may not read from.
   * Requeuing would spin on it for ever.
   */
  it('gives up on an object loculus will not hand over', async () => {
    const { listener, index } = harness({
      open: jest
        .fn()
        .mockRejectedValue(
          new ObjectUnreadable(KEY, 'forbidden', 'not offered to mneme'),
        ),
    });

    const result = await listener.handle(event());

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(index).not.toHaveBeenCalled();
  });

  /*
   * The store or the embedding provider being briefly unwell is the failure
   * worth retrying, and indexing is idempotent on the resource IRI.
   */
  it('requeues when remembering fails for a reason that might pass', async () => {
    const { listener } = harness({
      index: jest.fn().mockRejectedValue(new Error('qdrant is away')),
    });

    const result = await listener.handle(event(), delivery(false));

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(true);
  });

  /*
   * The bug this replaced: `Nack(true)` requeues with no delay, so a fault that
   * outlasts one retry became three deliveries in three milliseconds, for ever.
   * One retry catches a blip; the second failure is dropped.
   */
  it('drops a message that already failed once rather than looping on it', async () => {
    const { listener } = harness({
      index: jest.fn().mockRejectedValue(new Error('qdrant is still away')),
    });

    const result = await listener.handle(event(), delivery(true));

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });

  /*
   * A missing or rejected credential fails identically for every message in the
   * queue, so it must not be retried even once.
   */
  it('never retries a misconfiguration', async () => {
    const { listener } = harness({
      open: jest
        .fn()
        .mockRejectedValue(
          new Misconfigured('mneme has no service credentials'),
        ),
    });

    const result = await listener.handle(event(), delivery(false));

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });

  /*
   * organon 0.5.0 keeps only string trailing arguments, so a cause passed as
   * one is dropped — which is how the original loop logged thousands of lines
   * that never said what was wrong. Fixed in 0.5.1; this asserts the behaviour
   * the version this service actually resolves needs.
   */
  it('says why in the message, not in a trailing argument', async () => {
    const { listener } = harness({
      index: jest.fn().mockRejectedValue(new Error('qdrant is away')),
    });
    const logged: string[] = [];
    jest
      .spyOn(
        (listener as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      )
      .mockImplementation((message: string) => void logged.push(message));

    await listener.handle(event(), delivery(false));

    expect(logged[0]).toContain('qdrant is away');
  });
});
