import { Injectable, Logger } from '@nestjs/common';
import type { QdrantClient } from '@qdrant/js-client-rest';

import {
  type SearchOptions,
  type SearchResult,
  type StoredChunk,
  type VectorRepository,
} from './vector';

/** How many chunks may be read back for one resource. */
const MAX_CHUNKS_PER_RESOURCE = 1024;

/**
 * The memory, in Qdrant.
 *
 * Two rules run through every method here.
 *
 * **`organizationId` is a payload field that every filter carries**, rather
 * than a collection per tenant. One collection keeps the index dense and the
 * operational story simple; the price is that forgetting the filter reads
 * another tenant's memory, so no query in this class is written without it.
 *
 * **Ids are derived, never random.** A chunk's id comes from its resource IRI
 * and its position, so re-indexing a document overwrites it in place. Random
 * ids would accumulate a new copy of every document on every update, and the
 * old copies would go on answering searches for text that had been edited out.
 */
@Injectable()
export class QdrantVectorRepository implements VectorRepository {
  private readonly logger = new Logger(QdrantVectorRepository.name);

  constructor(
    private readonly client: QdrantClient,
    private readonly collection: string,
  ) { }

  /**
   * Creates the collection if it is missing, and refuses to use one whose
   * vectors are the wrong width.
   *
   * The refusal matters more than the creation. Qdrant rejects a mismatched
   * vector per write, so without this the service starts, looks healthy, and
   * fails on every single document with an error about dimensions rather than
   * about the model having changed.
   */
  async ensureCollection(dimensions: number, model: string): Promise<void> {
    const existing = await this.client.getCollections();

    if (!existing.collections.some((c) => c.name === this.collection)) {
      await this.client.createCollection(this.collection, {
        vectors: { size: dimensions, distance: 'Cosine' },
      });

      /*
       * Every query filters on these two, and an unindexed payload filter in
       * Qdrant is a scan. Creating them with the collection means the first
       * tenant to store anything is already searching an indexed field.
       */
      for (const field of ['organizationId', 'resourceUri']) {
        await this.client.createPayloadIndex(this.collection, {
          field_name: field,
          field_schema: 'keyword',
          wait: true,
        });
      }

      this.logger.log(
        `Created collection "${this.collection}" (${dimensions} dimensions, cosine) for ${model}`,
      );

      return;
    }

    const info = await this.client.getCollection(this.collection);
    const size = vectorSize(info);

    if (size !== undefined && size !== dimensions) {
      throw new Error(
        `Collection "${this.collection}" stores ${size}-dimension vectors, but ${model} produces ${dimensions}. ` +
        'Vectors from two models are not comparable, so this is a re-index rather than a migration: ' +
        'drop the collection and let mneme rebuild it, or point MNEME_COLLECTION at a new one.',
      );
    }
  }

  async upsert(chunks: StoredChunk[], embeddings: number[][]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    if (chunks.length !== embeddings.length) {
      throw new Error(
        `Got ${embeddings.length} embeddings for ${chunks.length} chunks.`,
      );
    }

    await this.client.upsert(this.collection, {
      wait: true,
      points: chunks.map((chunk, index) => ({
        id: chunk.id,
        vector: embeddings[index],
        payload: {
          organizationId: chunk.organizationId,
          resourceUri: chunk.resourceUri,
          // Top-level rather than inside `metadata`, because
          // `deleteResourceChunksFrom` filters on a range over it.
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          metadata: chunk.metadata,
        },
      })),
    });
  }

  async deleteResource(
    organizationId: string,
    resourceUri: string,
  ): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: this.resourceFilter(organizationId, resourceUri) },
    });
  }

  async deleteResourceChunksFrom(
    organizationId: string,
    resourceUri: string,
    fromIndex: number,
  ): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: {
        must: [
          ...this.resourceFilter(organizationId, resourceUri),
          { key: 'chunkIndex', range: { gte: fromIndex } },
        ],
      },
    });
  }

  async findByResource(
    organizationId: string,
    resourceUri: string,
  ): Promise<StoredChunk[]> {
    const { points } = await this.client.scroll(this.collection, {
      filter: { must: this.resourceFilter(organizationId, resourceUri) },
      limit: MAX_CHUNKS_PER_RESOURCE,
      with_payload: true,
      with_vector: false,
    });

    // Qdrant scrolls in id order, which is a hash of the position rather than
    // the position — so the caller gets them sorted here.
    return points
      .map((point) => this.toChunk(point))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async search(
    organizationId: string,
    embedding: number[],
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const { points } = await this.client.query(this.collection, {
      query: embedding,
      limit: options.limit ?? 10,
      score_threshold: options.minSimilarity,
      filter: {
        must: [
          { key: 'organizationId', match: { value: organizationId } },
        ],
      },
      with_payload: true,
      with_vector: false,
    });

    console.log('points: ', points);

    return points.map((point) => ({
      chunk: this.toChunk(point),
      similarity: point.score,
    }));
  }

  /** Whether Qdrant is reachable and the collection is there. */
  async describeCollection(): Promise<{ vectors: number }> {
    const info = await this.client.getCollection(this.collection);

    return { vectors: info.points_count ?? 0 };
  }

  private resourceFilter(organizationId: string, resourceUri: string) {
    return [
      { key: 'organizationId', match: { value: organizationId } },
      { key: 'resourceUri', match: { value: resourceUri } },
    ];
  }

  private toChunk(point: {
    id: string | number;
    payload?: Record<string, unknown> | null;
  }): StoredChunk {
    const payload = point.payload ?? {};

    return {
      id: String(point.id),
      organizationId: payload.organizationId as string,
      resourceUri: payload.resourceUri as string,
      chunkIndex: (payload.chunkIndex as number) ?? 0,
      content: (payload.content as string) ?? '',
      metadata: (payload.metadata as Record<string, unknown>) ?? {},
    };
  }
}

/**
 * The configured width of a collection's vectors.
 *
 * Qdrant reports either one unnamed vector or a map of named ones; mneme only
 * creates the unnamed kind, so anything else is left alone rather than guessed
 * at — returning undefined means "cannot tell", and the caller does not refuse
 * on a shape it does not understand.
 */
function vectorSize(info: {
  config?: { params?: { vectors?: unknown } };
}): number | undefined {
  const vectors = info.config?.params?.vectors;

  if (vectors && typeof vectors === 'object' && 'size' in vectors) {
    const { size } = vectors;

    return typeof size === 'number' ? size : undefined;
  }

  return undefined;
}
