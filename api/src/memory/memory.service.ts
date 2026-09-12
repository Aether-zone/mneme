import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidV5 } from './uuid';

import { TEXT_SPLITTER, type TextSplitter } from './chunk';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './embedding.provider';
import {
  VECTOR_REPOSITORY,
  type SearchOptions,
  type SearchResult,
  type StoredChunk,
  type VectorRepository,
} from './vector';

/**
 * Namespace for chunk ids. Arbitrary but fixed: changing it renames every
 * chunk, so a re-index would write a second copy of everything instead of
 * overwriting the first.
 */
const CHUNK_NAMESPACE = '8f2b1c94-6f3a-5d21-9b7e-1a4c8e2f0d63';

/** What mneme remembers alongside a chunk's text. */
export interface IndexOptions {
  metadata?: Record<string, unknown>;
}

export interface IndexResult {
  resourceUri: string;
  chunks: number;
}

/**
 * Remembering, recalling and forgetting.
 *
 * The unit is a *resource*, named by its IRI, not a chunk: callers index a
 * document and forget a document, and the chunking is this service's business.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
    @Inject(VECTOR_REPOSITORY)
    private readonly vectors: VectorRepository,
    @Inject(TEXT_SPLITTER) private readonly splitter: TextSplitter,
  ) {}

  /**
   * Remembers a resource, replacing whatever was remembered of it before.
   *
   * Idempotent, which the event stream requires: at-least-once delivery means
   * the same `ResourceUpdated` can arrive twice, and re-indexing has to be a
   * no-op rather than a second copy. Chunk ids are derived from the resource
   * IRI and the chunk's position, so a re-index overwrites in place.
   *
   * The order matters. Chunks are written *first* and the tail removed after,
   * so a resource that got shorter is never briefly missing its opening — the
   * worst a reader sees mid-update is one stale chunk at the end, rather than
   * a document that has vanished.
   */
  async index(
    organizationId: string,
    resourceUri: string,
    content: string,
    options: IndexOptions = {},
  ): Promise<IndexResult> {
    const chunks = this.splitter.split(content);

    if (chunks.length === 0) {
      /*
       * Nothing worth embedding. Still forget the old version: a resource
       * edited down to nothing should stop answering searches, and returning
       * early here would leave the previous text findable for ever.
       */
      await this.vectors.deleteResource(organizationId, resourceUri);

      this.logger.debug(`${resourceUri} has no indexable text; forgot it`);

      return { resourceUri, chunks: 0 };
    }

    const embeddings = await this.embeddings.embedMany(
      chunks.map((chunk) => chunk.content),
    );

    const stored: StoredChunk[] = chunks.map((chunk) => ({
      id: chunkId(organizationId, resourceUri, chunk.index),
      organizationId,
      resourceUri,
      chunkIndex: chunk.index,
      content: chunk.content,
      metadata: { ...(options.metadata ?? {}), chunkIndex: chunk.index },
    }));

    await this.vectors.upsert(stored, embeddings);
    await this.vectors.deleteResourceChunksFrom(
      organizationId,
      resourceUri,
      chunks.length,
    );

    this.logger.log(
      `Remembered ${resourceUri} as ${chunks.length} chunk(s) for ${organizationId}`,
    );

    return { resourceUri, chunks: chunks.length };
  }

  /** The passages closest to a question, within one organization. */
  async search(
    organizationId: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    const embedding = await this.embeddings.embed(query);

    return this.vectors.search(organizationId, embedding, options);
  }

  /** Forgets a resource entirely. */
  async forget(organizationId: string, resourceUri: string): Promise<void> {
    await this.vectors.deleteResource(organizationId, resourceUri);

    this.logger.log(`Forgot ${resourceUri} for ${organizationId}`);
  }

  /** What is remembered of one resource, in order. */
  recall(
    organizationId: string,
    resourceUri: string,
  ): Promise<StoredChunk[]> {
    return this.vectors.findByResource(organizationId, resourceUri);
  }
}

/**
 * A chunk's id: a UUID derived from the organization, the resource IRI and the
 * position.
 *
 * Derived rather than random so that indexing the same resource twice writes
 * the same points. Qdrant requires a UUID or an unsigned integer, which is why
 * this is a v5 UUID of the natural key rather than the natural key itself.
 *
 * **The organization is part of the key, not just of the payload.** Resource
 * IRIs are not globally unique — the ingest endpoint lets a caller name any
 * `uri` it likes — so without it, one tenant indexing `urn:doc:1` would
 * overwrite another tenant's chunks of the same name and take the document
 * away from them. The payload filter keeps a *reader* inside its own tenant;
 * this is what keeps a *writer* there.
 */
export function chunkId(
  organizationId: string,
  resourceUri: string,
  index: number,
): string {
  return uuidV5(`${organizationId}/${resourceUri}#${index}`, CHUNK_NAMESPACE);
}
