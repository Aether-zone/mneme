import { Test } from '@nestjs/testing';

import { CharacterTextSplitter } from './character.text-splitter';
import { TEXT_SPLITTER } from './chunk';
import { EMBEDDING_PROVIDER } from './embedding.provider';
import { HashingEmbeddingProvider } from './hashing.embedding.provider';
import { MemoryService, chunkId } from './memory.service';
import { VECTOR_REPOSITORY, type StoredChunk, type VectorRepository } from './vector';

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

  const module = await Test.createTestingModule({
    providers: [
      MemoryService,
      { provide: VECTOR_REPOSITORY, useValue: vectors },
      { provide: EMBEDDING_PROVIDER, useValue: new HashingEmbeddingProvider() },
      {
        provide: TEXT_SPLITTER,
        useValue: new CharacterTextSplitter({ chunkSize: 20, overlap: 0 }),
      },
    ],
  }).compile();

  return { service: module.get(MemoryService), vectors };
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

    await expect(service.forget('org-1', 'urn:doc:missing')).resolves
      .toBeUndefined();
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
