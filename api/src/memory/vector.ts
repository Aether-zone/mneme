/**
 * One embedded chunk, as stored.
 *
 * `organizationId` is on the record rather than implied by the collection: one
 * Qdrant holds every tenant's memory, so a query that forgot it would read
 * across the boundary. Every filter here carries it.
 */
export interface StoredChunk {
  /** Derived from `resourceUri` and `chunkIndex`, so re-indexing overwrites. */
  id: string;
  organizationId: string;
  /** The IRI of the resource this chunk came out of. */
  resourceUri: string;
  /** Its position in that resource, from 0. */
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface SearchOptions {
  limit?: number;
  /**
   * Cosine similarity a result must reach, 0 to 1. Without one, a search over
   * a small collection returns its whole contents ranked — technically correct
   * and useless to read.
   */
  minSimilarity?: number;
}

export interface SearchResult {
  chunk: StoredChunk;
  similarity: number;
}

/**
 * Where embedded chunks live.
 *
 * Narrower than it could be, deliberately: every method here has a caller. A
 * `findById` nothing reaches for is a method that will be wrong when something
 * finally does.
 */
export interface VectorRepository {
  /** Writes chunks, replacing any already stored under the same ids. */
  upsert(chunks: StoredChunk[], embeddings: number[][]): Promise<void>;

  /** Removes every chunk of a resource. Returns nothing — deleting what is
   * not there is not an error. */
  deleteResource(organizationId: string, resourceUri: string): Promise<void>;

  /**
   * Removes a resource's chunks from `fromIndex` onwards.
   *
   * This is what makes a re-index correct when a document gets *shorter*:
   * overwriting chunks 0..n leaves n+1.. from the previous version behind,
   * still matching searches with text the resource no longer contains.
   */
  deleteResourceChunksFrom(
    organizationId: string,
    resourceUri: string,
    fromIndex: number,
  ): Promise<void>;

  /** Every stored chunk of one resource, in order. */
  findByResource(
    organizationId: string,
    resourceUri: string,
  ): Promise<StoredChunk[]>;

  search(
    organizationId: string,
    embedding: number[],
    options?: SearchOptions,
  ): Promise<SearchResult[]>;
}

/** DI token for the configured {@link VectorRepository}. */
export const VECTOR_REPOSITORY = 'MNEME_VECTOR_REPOSITORY';
