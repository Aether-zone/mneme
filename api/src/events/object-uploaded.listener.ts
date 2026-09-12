import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import { Public } from '@aether-zone/organon';

import { ExtractorRegistry } from '../extract/extractor.registry';
import { mediaType, type Extractor } from '../extract/extractor';
import { Misconfigured, ObjectUnreadable } from '../loculus/errors';
import { LoculusClient } from '../loculus/loculus.client';
import {
  OBJECT_UPLOADED,
  objectUploadedSchema,
  objectUri,
} from '../loculus/object-events';
import { MemoryService } from '../memory/memory.service';

/**
 * The one thing this needs from the raw AMQP delivery.
 *
 * Structural rather than `ConsumeMessage` from `amqplib`: that package reaches
 * mneme only as a transitive dependency of the RabbitMQ module, and importing
 * a type from something this service never declared is how a build breaks on
 * somebody else's upgrade. One boolean does not justify the dependency.
 */
interface Delivery {
  fields: { redelivered: boolean };
}

/**
 * Files uploaded to the store, read and remembered.
 *
 * The third way into mneme's memory, and the first that starts from bytes.
 * `AetherEventListener` remembers what a service *says* about a resource, and
 * the HTTP endpoint remembers what somebody posts; this remembers what somebody
 * uploaded, which until now was invisible here — a person could put a document
 * in the workspace and find that searching for its contents returned nothing.
 *
 * Most of what arrives is not mneme's to read. The bucket is shared with every
 * service, and recordings, images and PDFs outnumber the text. So the shape is
 * a filter before it is a pipeline: content type first, because it is free and
 * settles most messages, then the organization, and only then the round trip to
 * fetch bytes.
 */
@Injectable()
export class ObjectUploadedListener {
  private readonly logger = new Logger(ObjectUploadedListener.name);

  constructor(
    private readonly extractors: ExtractorRegistry,
    private readonly loculus: LoculusClient,
    private readonly memory: MemoryService,
  ) {}

  /*
   * `@Public()` on something that is not a route: `PistisAuthModule` registers
   * its JWT guard as an `APP_GUARD`, and a global guard runs on every execution
   * context — an AMQP delivery included. There is no HTTP request behind one,
   * so the token extractor reads `headers.authorization` off undefined and
   * throws before this method is entered. That failure happens outside the
   * handler, so the `Nack` decisions below never run and the broker redelivers
   * for ever.
   *
   * Its own durable queue, bound to the one routing key — **not** `mneme.events`,
   * which `AetherEventListener` already holds. Two subscriptions sharing a queue
   * take turns eating each other's messages, so half the uploads would reach the
   * consumer that has no use for them and never arrive here.
   */
  @Public()
  @RabbitSubscribe({
    exchange: 'aether-zone',
    routingKey: OBJECT_UPLOADED,
    queue: 'mneme.object-uploaded',
    queueOptions: { durable: true },
  })
  async handle(message: unknown, raw?: Delivery): Promise<Nack | undefined> {
    const parsed = objectUploadedSchema.safeParse(message);

    if (!parsed.success) {
      /*
       * Dropped rather than requeued: it will not become valid on a second
       * reading. Warn rather than debug — unlike the `#` subscription, this
       * queue is bound to one key, so everything arriving was addressed to us
       * and a message that does not fit means the two ends have drifted apart.
       */
      this.logger.warn(
        `Ignoring a malformed "${OBJECT_UPLOADED}": ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      );

      return new Nack(false);
    }

    const event = parsed.data;

    /*
     * The cheap question first. Nothing has been fetched yet, so a recording or
     * an image costs one schema parse and a lookup — which is the common case,
     * and the reason this check comes before everything else.
     */
    const extractor = this.extractors.find(event.contentType);

    if (!extractor) {
      this.logger.debug(
        `Nothing here reads ${mediaType(event.contentType)}; leaving "${event.objectKey}" alone`,
      );

      return undefined;
    }

    /*
     * Which tenant's memory this belongs in. Every chunk carries it and every
     * search filters on it, so remembering under a guess would put one
     * organization's document into another's results — the one failure here
     * that is worse than not indexing at all.
     *
     * loculus sends `null` for an object uploaded by a service, which has no
     * organization claim to state. There is nothing to file that under, and no
     * later delivery will supply one.
     */
    if (!event.organizationId) {
      this.logger.warn(
        `"${event.objectKey}" carries no organizationId; not remembering it`,
      );

      return new Nack(false);
    }

    try {
      return await this.remember(extractor, event.organizationId, event);
    } catch (cause) {
      return this.giveUpOrRetry(event.objectKey, cause, raw);
    }
  }

  /**
   * What to do with a failure, which is mostly the question of whether it can
   * come good on its own.
   *
   * **Every branch puts the reason in the message rather than passing the error
   * as a trailing argument.** organon 0.5.0 — the version this service resolves
   * — keeps only *string* trailing arguments in `readTrailing`, so
   * `logger.error(text, cause)` writes the text and silently drops the cause.
   * That is how a failing consumer comes to log thousands of lines that do not
   * say what went wrong.
   *
   * Fixed in organon 0.5.1, which reads an `Error` there into `stack` and a
   * `cause` field. Once this service is on that version the structured form is
   * the better one and these can pass the cause instead — a field an aggregator
   * can group by beats a reason spliced into prose.
   */
  private giveUpOrRetry(
    objectKey: string,
    cause: unknown,
    raw?: Delivery,
  ): Nack {
    if (cause instanceof ObjectUnreadable) {
      // Gone, or not offered to mneme. Neither improves on redelivery.
      this.logger.warn(`Cannot read "${objectKey}": ${cause.message}`);

      return new Nack(false);
    }

    if (cause instanceof Misconfigured) {
      /*
       * mneme cannot reach loculus at all. Every message in the queue fails
       * this way, so requeuing turns one missing credential into an endless
       * loop of identical errors. Dropped, loudly: the message says what to
       * change, and says it once per delivery rather than for ever.
       */
      this.logger.error(
        `Cannot read "${objectKey}" and will not retry: ${cause.message}`,
      );

      return new Nack(false);
    }

    const reason = cause instanceof Error ? cause.message : String(cause);

    /*
     * Something that might pass — Qdrant restarting, the store briefly
     * unreachable, pistis answering 5xx. Worth one retry, and exactly one.
     *
     * `redelivered` is the bound, and it is the fix for the loop this had
     * before: `Nack(true)` requeues with no delay, the broker hands the same
     * message straight back, and a lasting fault becomes three deliveries in
     * three milliseconds, for ever. One retry catches the blip; anything longer
     * is dropped rather than spun on.
     *
     * A dead-letter exchange with a TTL would be better — real backoff, and
     * nothing lost — but that is broker topology rather than code, and this
     * stops the bleeding without it.
     */
    if (raw?.fields.redelivered) {
      this.logger.error(
        `"${objectKey}" failed twice; dropping it rather than looping: ${reason}`,
      );

      return new Nack(false);
    }

    /*
     * Indexing is idempotent — chunk ids derive from the resource IRI — so a
     * redelivery overwrites rather than duplicates, and costs only the work
     * again.
     */
    this.logger.error(
      `"${objectKey}" could not be remembered; retrying once: ${reason}`,
    );

    return new Nack(true);
  }

  /** Fetch, read, remember. The extractor is the one `handle` already found. */
  private async remember(
    extractor: Extractor,
    organizationId: string,
    event: {
      objectKey: string;
      name: string;
      contentType: string;
      size: number;
    },
  ): Promise<undefined> {
    const stream = await this.loculus.open(event.objectKey);

    const { content, metadata } = await extractor.extract({
      stream,
      contentType: event.contentType,
      filename: event.name,
    });

    const { chunks } = await this.memory.index(
      organizationId,
      objectUri(event.objectKey),
      content,
      {
        metadata: {
          ...metadata,
          objectKey: event.objectKey,
          size: event.size,
          /*
           * How this was remembered, which the two other paths do not record
           * and this one should: a chunk that came from a file somebody
           * uploaded is a different kind of answer from one derived from a
           * resource another service announced.
           */
          source: 'loculus',
        },
      },
    );

    this.logger.log(
      `Remembered "${event.objectKey}" as ${chunks} chunk(s) for ${organizationId}`,
    );

    return undefined;
  }
}
