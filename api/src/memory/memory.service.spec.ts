import { Test } from '@nestjs/testing';
import { EventPublisher, type AetherEvent } from '@aether-zone/organon';

import { CharacterTextSplitter } from './character.text-splitter';
import { TEXT_SPLITTER } from './chunk';
import { EMBEDDING_PROVIDER } from './embedding.provider';
import { HashingEmbeddingProvider } from './hashing.embedding.provider';
import {
  MEMORY_FORGOTTEN,
  MEMORY_INDEXED,
  MNEME_SOURCE,
} from './memory.events';
import { chunkIri, memoryIri, type MemoryJsonLD } from './memory.json-ld';
import { MemoryService, chunkId } from './memory.service';
import {
  VECTOR_REPOSITORY,
  type StoredChunk,
  type VectorRepository,
} from './vector';

/**
 * An in-memory stand-in for Qdrant that enforces the one rule the real one
 * does: a point is identified by its id, so writing the same id twice replaces
 * rather than duplicates. Without that, the re-index tests below would pass
 * against a store that simply appended.
 */
class FakeVectorRepository implements VectorRepository {
  readonly points = new Map<string, StoredChunk>();

  upsert(chunks: StoredChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.points.set(chunk.id, chunk);
    }

    return Promise.resolve();
  }

  deleteResource(organizationId: string, resourceUri: string): Promise<void> {
    for (const [id, chunk] of this.points) {
      if (
        chunk.organizationId === organizationId &&
        chunk.resourceUri === resourceUri
      ) {
        this.points.delete(id);
      }
    }

    return Promise.resolve();
  }

  deleteResourceChunksFrom(
    organizationId: string,
    resourceUri: string,
    fromIndex: number,
  ): Promise<void> {
    for (const [id, chunk] of this.points) {
      if (
        chunk.organizationId === organizationId &&
        chunk.resourceUri === resourceUri &&
        chunk.chunkIndex >= fromIndex
      ) {
        this.points.delete(id);
      }
    }

    return Promise.resolve();
  }

  findByResource(
    organizationId: string,
    resourceUri: string,
  ): Promise<StoredChunk[]> {
    return Promise.resolve(
      [...this.points.values()]
        .filter(
          (chunk) =>
            chunk.organizationId === organizationId &&
            chunk.resourceUri === resourceUri,
        )
        .sort((a, b) => a.chunkIndex - b.chunkIndex),
    );
  }

  search(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

const build = async () => {
  const vectors = new FakeVectorRepository();

  /*
   * A publisher that records rather than connects. What these tests are about
   * is what mneme writes and announces, not the broker underneath.
   */
  const published: { routingKey: string; event: AetherEvent<MemoryJsonLD> }[] =
    [];
  const events = {
    publish: jest.fn((routingKey: string, event: AetherEvent<MemoryJsonLD>) => {
      published.push({ routingKey, event });

      return Promise.resolve();
    }),
  };

  const module = await Test.createTestingModule({
    providers: [
      MemoryService,
      { provide: VECTOR_REPOSITORY, useValue: vectors },
      { provide: EMBEDDING_PROVIDER, useValue: new HashingEmbeddingProvider() },
      {
        provide: TEXT_SPLITTER,
        useValue: new CharacterTextSplitter({ chunkSize: 20, overlap: 0 }),
      },
      { provide: EventPublisher, useValue: events },
    ],
  }).compile();

  return { service: module.get(MemoryService), vectors, events, published };
};

describe('indexing', () => {
  it('remembers a document as chunks under its resource IRI', async () => {
    const { service, vectors } = await build();

    const result = await service.index('org-1', 'urn:doc:1', 'a'.repeat(50));

    expect(result).toEqual({ resourceUri: 'urn:doc:1', chunks: 3 });
    expect(vectors.points.size).toBe(3);
  });

  it('derives chunk ids, so the same document written twice is one copy', async () => {
    // At-least-once delivery means the same ResourceUpdated arrives twice.
    // Random ids would accumulate a second copy of everything, and the copies
    // would go on answering searches.
    const { service, vectors } = await build();

    await service.index('org-1', 'urn:doc:1', 'a'.repeat(50));
    await service.index('org-1', 'urn:doc:1', 'a'.repeat(50));

    expect(vectors.points.size).toBe(3);
    expect([...vectors.points.keys()]).toContain(
      chunkId('org-1', 'urn:doc:1', 0),
    );
  });

  it('drops the tail when a document gets shorter', async () => {
    // The bug this exists to prevent: overwriting chunks 0..n leaves n+1..
    // from the previous version behind, still matching searches for text the
    // document no longer contains.
    const { service, vectors } = await build();

    await service.index('org-1', 'urn:doc:1', 'a'.repeat(100));
    expect(vectors.points.size).toBe(5);

    await service.index('org-1', 'urn:doc:1', 'b'.repeat(20));

    const remaining = await service.recall('org-1', 'urn:doc:1');

    expect(remaining).toHaveLength(1);
    expect(remaining[0].content).toBe('b'.repeat(20));
  });

  it('forgets a document edited down to nothing', async () => {
    const { service, vectors } = await build();

    await service.index('org-1', 'urn:doc:1', 'something');
    await service.index('org-1', 'urn:doc:1', '   ');

    expect(vectors.points.size).toBe(0);
  });

  it('keeps each organization’s chunks separate', async () => {
    const { service } = await build();

    await service.index('org-1', 'urn:doc:1', 'first');
    await service.index('org-2', 'urn:doc:1', 'second');

    // Same resource IRI in two tenants is two memories, not one shared.
    expect(await service.recall('org-1', 'urn:doc:1')).toHaveLength(1);
    expect((await service.recall('org-2', 'urn:doc:1'))[0].content).toBe(
      'second',
    );
  });

  it('carries the caller’s metadata onto every chunk', async () => {
    const { service } = await build();

    await service.index('org-1', 'urn:doc:1', 'a'.repeat(50), {
      metadata: { source: 'akouo' },
    });

    const chunks = await service.recall('org-1', 'urn:doc:1');

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.metadata.source)).toEqual([
      'akouo',
      'akouo',
      'akouo',
    ]);
    // The position is recorded too, so a result can say where in the document
    // it came from.
    expect(chunks.map((chunk) => chunk.metadata.chunkIndex)).toEqual([0, 1, 2]);
  });
});

describe('forgetting', () => {
  it('removes every chunk of the resource', async () => {
    const { service, vectors } = await build();

    await service.index('org-1', 'urn:doc:1', 'a'.repeat(50));
    await service.forget('org-1', 'urn:doc:1');

    expect(vectors.points.size).toBe(0);
  });

  it('is not an error for something never remembered', async () => {
    const { service } = await build();

    await expect(
      service.forget('org-1', 'urn:doc:missing'),
    ).resolves.toBeUndefined();
  });
});

describe('searching', () => {
  it('does not embed an empty question', async () => {
    const { service } = await build();

    // A blank query would otherwise cost a round trip to the model to ask for
    // the nearest neighbours of nothing.
    expect(await service.search('org-1', '   ')).toEqual([]);
  });
});

describe('tenant isolation', () => {
  it('does not let one organization overwrite another’s chunks', async () => {
    // Caught by the test above before it was true: chunk ids were once derived
    // from the resource IRI alone, so two tenants indexing the same IRI wrote
    // the same point and the second took the document away from the first.
    // The ingest endpoint lets a caller name any `uri`, which made that a
    // cross-tenant write rather than a coincidence.
    const { service, vectors } = await build();

    await service.index('org-1', 'urn:doc:shared', 'belongs to one');
    await service.index('org-2', 'urn:doc:shared', 'belongs to two');

    expect(vectors.points.size).toBe(2);

    const first = await service.recall('org-1', 'urn:doc:shared');
    const second = await service.recall('org-2', 'urn:doc:shared');

    expect(first[0].content).toBe('belongs to one');
    expect(second[0].content).toBe('belongs to two');
  });

  it('forgets in one organization without touching the other', async () => {
    const { service } = await build();

    await service.index('org-1', 'urn:doc:shared', 'belongs to one');
    await service.index('org-2', 'urn:doc:shared', 'belongs to two');

    await service.forget('org-2', 'urn:doc:shared');

    expect(await service.recall('org-1', 'urn:doc:shared')).toHaveLength(1);
    expect(await service.recall('org-2', 'urn:doc:shared')).toHaveLength(0);
  });
});

/*
 * What the rest of the workspace is told, and — more to the point — what
 * arachni can walk once it has it. The chain these assertions protect is
 * `(:Chunk)-[:PART_OF]->(:Memory)-[:REMEMBERS]->(the thing that was read)`.
 */
/**
 * The document out of an event, narrowed.
 *
 * `data` is on the created and updated arms of the union and not on the
 * deleted one, so reading it off the union needs the type checked first — and
 * a test that asked a deletion for its document has found a real bug, not a
 * typing inconvenience.
 */
const documentOf = (event: AetherEvent<MemoryJsonLD>): MemoryJsonLD => {
  if (event.type === 'aether:ResourceDeleted') {
    throw new Error(`${event.subject} was a deletion; it carries no document`);
  }

  return event.data;
};

describe('announcing what was remembered', () => {
  const objectUri = 'urn:aether:object:aether/org-1/a24b27c8-README.md';

  it('announces the memory under its own IRI, not the resource’s', async () => {
    // mneme's reading of a file is not the file. Publishing under the
    // resource's own IRI would put mneme's chunk count and excerpts onto
    // loculus's node, and there would be nothing left to traverse between.
    const { service, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));

    expect(published).toHaveLength(1);
    expect(published[0].routingKey).toBe(MEMORY_INDEXED);
    expect(published[0].event.subject).toBe(memoryIri('org-1', objectUri));
    expect(published[0].event.subject).not.toBe(objectUri);
  });

  it('points the memory at what it is a memory of', async () => {
    const { service, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));

    const document = documentOf(published[0].event);

    // A bare reference: arachni would treat anything richer as owned by the
    // memory and delete the file's node when the memory is forgotten.
    expect(document.remembers).toEqual({ '@id': objectUri });
    expect(Object.keys(document.remembers)).toEqual(['@id']);
  });

  it('carries the chunks inside the document, so they belong to it', async () => {
    const { service, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));

    const document = documentOf(published[0].event);

    expect(document.chunkCount).toBe(3);
    expect(document.chunks).toHaveLength(3);
    expect(document.chunks[0]['@type']).toBe('aether:Chunk');
    expect(document.chunks[0].index).toBe(0);
  });

  /*
   * The join between the two stores. A search returns the organization, the
   * resource and the index; the graph node has to be derivable from exactly
   * those, or a hit cannot be walked into the graph.
   */
  it('names a chunk in the graph by the id the vector store holds it under', async () => {
    const { service, vectors, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));

    const document = documentOf(published[0].event);
    const stored = [...vectors.points.values()].find(
      (chunk) => chunk.chunkIndex === 0,
    );

    expect(document.chunks[0]['@id']).toBe(chunkIri('org-1', objectUri, 0));
    expect(document.chunks[0]['@id']).toContain(stored!.id);
  });

  it('gives a memory and its own first chunk different identities', () => {
    // Both are derived from the same organization and resource, so a naming
    // scheme that did not separate them would collapse the two into one node.
    expect(memoryIri('org-1', objectUri)).not.toBe(
      chunkIri('org-1', objectUri, 0),
    );
  });

  it('keeps each organization’s memory of the same resource apart', () => {
    // A `resourceUri` is not globally unique — the ingest endpoint takes any
    // uri a caller likes — so the tenant has to be part of the name.
    expect(memoryIri('org-1', 'urn:doc:1')).not.toBe(
      memoryIri('org-2', 'urn:doc:1'),
    );
  });

  it('addresses the same node when a document is indexed again', async () => {
    const { service, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));
    await service.index('org-1', objectUri, 'b'.repeat(20));

    expect(published[1].event.subject).toBe(published[0].event.subject);
    expect(documentOf(published[1].event).chunkCount).toBe(1);
  });

  it('announces a deletion when a resource is forgotten', async () => {
    const { service, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));
    await service.forget('org-1', objectUri);

    expect(published[1].routingKey).toBe(MEMORY_FORGOTTEN);
    expect(published[1].event.type).toBe('aether:ResourceDeleted');
    expect(published[1].event.subject).toBe(memoryIri('org-1', objectUri));
  });

  /*
   * A resource edited down to nothing stops answering searches, so its chunks
   * must leave the graph too — otherwise arachni keeps offering passages that
   * can never be recalled.
   */
  it('announces a deletion when a document is edited down to nothing', async () => {
    const { service, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));
    await service.index('org-1', objectUri, '   ');

    expect(published[1].routingKey).toBe(MEMORY_FORGOTTEN);
    expect(published[1].event.type).toBe('aether:ResourceDeleted');
  });

  it('marks every event as mneme’s own, which is what stops the loop', async () => {
    // mneme's `#` subscription indexes anything announced. Without a source it
    // recognises as its own, a memory becomes a memory of a memory, for ever.
    const { service, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));
    await service.forget('org-1', objectUri);

    expect(published.every((sent) => sent.event.source === MNEME_SOURCE)).toBe(
      true,
    );
  });

  it('states the same instant in the envelope and the document', async () => {
    const { service, published } = await build();

    await service.index('org-1', objectUri, 'a'.repeat(50));

    expect(documentOf(published[0].event).indexedAt).toBe(
      published[0].event.time,
    );
  });

  /*
   * The chunks are written; the event is a courtesy. Failing the caller here
   * would turn a broker problem into a lost document.
   */
  it('keeps the document indexed when the event cannot be published', async () => {
    const { service, events, vectors } = await build();
    events.publish.mockRejectedValue(new Error('broker is away'));

    await expect(
      service.index('org-1', objectUri, 'a'.repeat(50)),
    ).resolves.toMatchObject({ chunks: 3 });
    expect(vectors.points.size).toBe(3);
  });
});
