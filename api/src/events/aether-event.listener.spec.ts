import { Nack } from '@golevelup/nestjs-rabbitmq';

import { MNEME_SOURCE } from '../memory/memory.events';
import { memoryIri } from '../memory/memory.json-ld';
import type { MemoryService } from '../memory/memory.service';
import { AetherEventListener } from './aether-event.listener';

/** A meeting announced by akouo: the ordinary thing mneme remembers. */
const meetingEvent = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  source: 'https://aether.zone/akouo',
  time: '2026-09-12T09:00:00.000Z',
  subject: 'urn:aether:meeting:m1',
  organizationId: 'org-1',
  type: 'aether:ResourceCreated',
  data: {
    '@context': { aether: 'https://aether.zone/vocab/' },
    '@id': 'urn:aether:meeting:m1',
    '@type': 'aether:Meeting',
    title: 'Weekly sync',
  },
  ...over,
});

function harness() {
  const memory = {
    index: jest.fn().mockResolvedValue({ chunks: 1 }),
    forget: jest.fn().mockResolvedValue(undefined),
  };

  return {
    listener: new AetherEventListener(memory as unknown as MemoryService),
    memory,
  };
}

describe('AetherEventListener', () => {
  it('remembers a resource another service announced', async () => {
    const { listener, memory } = harness();

    await expect(listener.handle(meetingEvent())).resolves.toBeUndefined();

    expect(memory.index).toHaveBeenCalledWith(
      'org-1',
      'urn:aether:meeting:m1',
      expect.stringContaining('Weekly sync'),
      expect.anything(),
    );
  });

  /*
   * The runaway loop this guard exists for. mneme announces a memory of every
   * resource it indexes, and this subscription is bound to `#` — so its own
   * announcement comes straight back. Indexing it would announce a memory of
   * the memory, and each turn embeds text and writes chunks.
   */
  it('ignores its own announcements rather than remembering them', async () => {
    const { listener, memory } = harness();

    const result = await listener.handle(
      meetingEvent({
        source: MNEME_SOURCE,
        subject: memoryIri('org-1', 'urn:aether:meeting:m1'),
        data: {
          '@context': { aether: 'https://aether.zone/vocab/' },
          '@id': memoryIri('org-1', 'urn:aether:meeting:m1'),
          '@type': 'aether:Memory',
          chunkCount: 1,
        },
      }),
    );

    expect(result).toBeUndefined();
    expect(memory.index).not.toHaveBeenCalled();
  });

  it('ignores its own deletions too', async () => {
    const { listener, memory } = harness();

    await listener.handle(
      meetingEvent({
        source: MNEME_SOURCE,
        type: 'aether:ResourceDeleted',
        data: undefined,
      }),
    );

    expect(memory.forget).not.toHaveBeenCalled();
  });

  /*
   * The guard is on the producer, not on the type: another service announcing
   * something about a memory is news, and dropping it by `@type` would lose it.
   */
  it('still remembers a memory document announced by somebody else', async () => {
    const { listener, memory } = harness();

    await listener.handle(
      meetingEvent({ source: 'https://aether.zone/arachni' }),
    );

    expect(memory.index).toHaveBeenCalled();
  });

  it('forgets a resource another service deleted', async () => {
    const { listener, memory } = harness();

    await listener.handle(
      meetingEvent({ type: 'aether:ResourceDeleted', data: undefined }),
    );

    expect(memory.forget).toHaveBeenCalledWith(
      'org-1',
      'urn:aether:meeting:m1',
    );
  });

  it('drops an event that names no organization', async () => {
    // Remembering under a guess would let one tenant search another's
    // documents: the organization is on every chunk.
    const { listener, memory } = harness();

    const result = await listener.handle(
      meetingEvent({ organizationId: undefined }),
    );

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(memory.index).not.toHaveBeenCalled();
  });
});
