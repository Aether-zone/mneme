import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  aetherEventSchema,
  Public,
  type JsonLdDocument,
} from '@aether-zone/organon';

import { MNEME_SOURCE } from '../memory/memory.events';
import { MemoryService } from '../memory/memory.service';

import { documentToText } from './json-ld.text';

/**
 * Everything the workspace announces about a resource, remembered.
 *
 * mneme subscribes to `#` — every routing key on the shared exchange — and
 * decides from the event itself, not from the key, what to do. A service that
 * had to be told about `meeting.created` before it could remember a meeting
 * would need changing every time another service learned to announce
 * something, and that is precisely the coupling a shared vocabulary exists to
 * remove. arachni consumes the same stream the same way and projects it into a
 * graph instead; the two are siblings, not layers.
 *
 * The queue is its own. Two consumers of one exchange need two queues, or they
 * take turns eating each other's events — `arachni.events` and `mneme.events`
 * each get every message.
 */
@Injectable()
export class AetherEventListener {
  private readonly logger = new Logger(AetherEventListener.name);

  constructor(private readonly memory: MemoryService) {}

  /*
   * `@Public()` on something that is not a route, because `PistisAuthModule`
   * registers its JWT guard as an `APP_GUARD` and a global guard in Nest runs
   * on *every* execution context — an AMQP delivery included. There is no HTTP
   * request behind one, so the token extractor reads `headers.authorization`
   * off undefined and throws before this method is entered.
   *
   * That failure mode is worse than it sounds: it happens outside the handler,
   * so the `Nack` decisions below never run, and the broker redelivers the
   * message for ever. This one line is what stops that.
   *
   * The better fix belongs in organon — its guard should decline to judge a
   * transport it cannot read a token from, rather than every consumer of the
   * exchange having to remember this. Until then, opting out here is the whole
   * of the workaround, and it grants nothing: the exchange is not reachable
   * from outside the workspace.
   */
  @Public()
  @RabbitSubscribe({
    exchange: 'aether-zone',
    routingKey: '#',
    // Named, not anonymous: an anonymous queue is exclusive and vanishes with
    // the process, so a restart would lose whatever arrived meanwhile.
    queue: 'mneme.events',
    queueOptions: { durable: true },
  })
  async handle(message: unknown): Promise<Nack | undefined> {
    const parsed = aetherEventSchema.safeParse(message);

    if (!parsed.success) {
      /*
       * Not an Aether event, or a malformed one. Dropped rather than requeued:
       * it will not become valid on a second reading, and `Nack(true)` on a
       * message that can never succeed is a loop that takes the queue down.
       *
       * The exchange carries every service's events, so this is also the
       * ordinary path for one mneme has no interest in — hence debug.
       */
      this.logger.debug(
        `Ignoring a message that is not an Aether event: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      );

      return new Nack(false);
    }

    const event = parsed.data;

    /*
     * mneme's own announcements, dropped before anything else looks at them.
     *
     * **This is a runaway loop, not a slow one.** mneme publishes a memory of
     * every resource it indexes, and this subscription is bound to `#` — so
     * without this, indexing a meeting announces a memory, which arrives here,
     * which is indexed as a resource in its own right, which announces a memory
     * of the memory, and so on until something falls over. Each turn writes
     * chunks and embeds text, so it is expensive from the first iteration.
     *
     * By `source` rather than by routing key or by `@type`: the key says only
     * which binding matched, and a type check would have to be updated for
     * every kind of document mneme learns to publish. The producer is the fact
     * that matters — mneme has nothing to learn from its own reading.
     */
    if (event.source === MNEME_SOURCE) {
      return undefined;
    }

    /*
     * Which tenant's memory this belongs in. An event without one cannot be
     * filed: the organization is on every chunk, and remembering under a guess
     * would let one tenant search another's documents.
     */
    if (!event.organizationId) {
      this.logger.warn(
        `"${event.type}" for ${event.subject} carries no organizationId; dropping it`,
      );

      return new Nack(false);
    }

    try {
      if (event.type === 'aether:ResourceDeleted') {
        await this.memory.forget(event.organizationId, event.subject);

        return undefined;
      }

      const document = event.data as JsonLdDocument;

      await this.memory.index(
        event.organizationId,
        event.subject,
        documentToText(document),
        {
          metadata: {
            type: document['@type'],
            source: event.source,
            // The event's own time, not now: re-indexing an old event should
            // not make the resource look freshly changed.
            time: event.time,
          },
        },
      );

      return undefined;
    } catch (cause) {
      /*
       * Embedding or the store failed, both of which may be temporary — so
       * this one *is* requeued. Indexing is idempotent: chunk ids are derived
       * from the resource IRI, so a redelivery overwrites rather than
       * duplicates, and costs only the round trip.
       */
      this.logger.error(
        `"${event.type}" for ${event.subject} could not be remembered; requeuing`,
        cause,
      );

      return new Nack(true);
    }
  }
}
