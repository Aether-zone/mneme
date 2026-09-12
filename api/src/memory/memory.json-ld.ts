import type { JsonLdDocument, JsonLdReference } from '@aether-zone/organon';

import { chunkId } from './memory.service';

/**
 * What mneme remembers, as the rest of aether-zone sees it.
 *
 * Two resources, and the distinction between them is the whole design:
 *
 * - A **memory** is mneme's reading of some other resource. Not the resource —
 *   a meeting is chronos's, an uploaded file is loculus's, and mneme has no
 *   business publishing a second node for either. What mneme owns is the fact
 *   that it read one and what came out.
 * - A **chunk** is one passage of that reading, and the unit a search actually
 *   returns.
 *
 * So the graph reads `(:Chunk)-[:PART_OF]->(:Memory)-[:REMEMBERS]->(whatever it
 * was a memory of)`, and that last hop is what joins mneme's index onto
 * everything else the workspace knows — a search hit can be walked back to the
 * file it came from, and onwards to whatever announced that file.
 */

/** The vocabulary aether-zone publishes under. */
export const AETHER_VOCAB = 'https://aether.zone/vocab/';

/**
 * The context every memory document carries.
 *
 * Inline rather than a URL: a remote context has to be fetched before a
 * document can be read, which turns every consumer into an HTTP client and this
 * service into their dependency.
 *
 * The terms are single words on purpose. arachni turns a predicate's local name
 * into a Neo4j relationship type by stripping everything but letters and digits
 * and upper-casing what is left, so `aether:derivedFrom` would arrive as
 * `DERIVEDFROM`. `remembers` and `chunk` survive that intact.
 */
export const MEMORY_CONTEXT = {
  aether: AETHER_VOCAB,
  /** The resource this is a memory *of*. Becomes `REMEMBERS`. */
  remembers: 'aether:remembers',
  /** The property is plural, the predicate singular: one `CHUNK` edge each. */
  chunks: 'aether:chunk',
} as const;

export interface ChunkJsonLD extends JsonLdDocument {
  '@type': 'aether:Chunk';
  '@context': typeof MEMORY_CONTEXT;

  /** Its position in the resource, from 0. */
  index: number;
  /** Characters. What a reader needs to judge a chunk without holding it. */
  length: number;
  /**
   * The opening of the passage, truncated.
   *
   * Deliberately not the whole text. mneme is the text store and arachni is the
   * graph; copying every chunk into Neo4j would double the storage and, worse,
   * make a second copy that drifts the moment one is re-indexed and the other
   * is not. Enough to recognise a node in a query result, and no more.
   */
  excerpt: string;
}

export interface MemoryJsonLD extends JsonLdDocument {
  '@type': 'aether:Memory';
  '@context': typeof MEMORY_CONTEXT;

  /**
   * What was read, by its own IRI.
   *
   * A bare reference, never a nested resource, and the difference matters:
   * arachni treats a nested resource as *defined inside* this document and
   * deletes it along with it. The file outlives mneme forgetting it.
   *
   * The node it points at may not exist yet. arachni merges on the IRI, so the
   * reference stands up a placeholder that whichever service announces that
   * resource fills in later — or never, in which case the edge still records
   * truthfully what this is a memory of.
   */
  remembers: JsonLdReference;

  /** How many chunks the resource was split into. */
  chunkCount: number;
  /** When mneme last read it. */
  indexedAt: string;

  /**
   * Nested rather than referenced, which is what makes them `PART_OF` in the
   * graph — so forgetting a resource takes its chunks with it, and re-indexing
   * a document that got shorter prunes the chunks it no longer has. Both fall
   * out of arachni's ownership rule; neither would happen with references.
   */
  chunks: ChunkJsonLD[];
}

/**
 * The IRI of mneme's memory of a resource.
 *
 * Derived from the tenant and the resource rather than random, so re-indexing
 * addresses the same node instead of writing a second one beside it — the same
 * reasoning as {@link chunkId}, and the same namespace, since a memory and its
 * chunks are named from the same facts.
 *
 * The organization is part of the name because a `resourceUri` is not globally
 * unique: the ingest endpoint lets a caller name any `uri` it likes, so two
 * tenants indexing `urn:doc:1` must not collide on one node.
 */
export const memoryIri = (
  organizationId: string,
  resourceUri: string,
): string => `urn:aether:memory:${memoryId(organizationId, resourceUri)}`;

/**
 * The IRI of one chunk.
 *
 * **The same id the vector store holds it under.** A search returns the
 * organization, the resource and the index, which is exactly what this is
 * derived from — so a hit can be turned into a graph node without mneme
 * having to publish a lookup table for it.
 */
export const chunkIri = (
  organizationId: string,
  resourceUri: string,
  index: number,
): string => `urn:aether:chunk:${chunkId(organizationId, resourceUri, index)}`;

const memoryId = (organizationId: string, resourceUri: string): string =>
  chunkId(organizationId, resourceUri, MEMORY_INDEX);

/**
 * The position a memory is named from, standing outside the chunks' range.
 *
 * `-1` so that a memory and its own chunk 0 cannot derive the same id. Any
 * value no chunk can hold would do; a negative one says why it is not a
 * position.
 */
const MEMORY_INDEX = -1;

/** Longest excerpt carried into the graph. */
const EXCERPT_LENGTH = 200;

export interface RememberedChunk {
  index: number;
  content: string;
}

/**
 * A memory as a JSON-LD document.
 *
 * `indexedAt` is passed in rather than read from the clock here, so that the
 * document and the event envelope that carries it state the same instant.
 */
export function toMemoryDocument(
  organizationId: string,
  resourceUri: string,
  chunks: RememberedChunk[],
  indexedAt: string,
): MemoryJsonLD {
  return {
    '@context': MEMORY_CONTEXT,
    '@id': memoryIri(organizationId, resourceUri),
    '@type': 'aether:Memory',
    remembers: { '@id': resourceUri },
    chunkCount: chunks.length,
    indexedAt,
    chunks: chunks.map((chunk) => ({
      '@context': MEMORY_CONTEXT,
      '@id': chunkIri(organizationId, resourceUri, chunk.index),
      '@type': 'aether:Chunk' as const,
      index: chunk.index,
      length: chunk.content.length,
      excerpt: excerptOf(chunk.content),
    })),
  };
}

/** The opening of a passage, with an ellipsis when there is more. */
function excerptOf(content: string): string {
  return content.length <= EXCERPT_LENGTH
    ? content
    : `${content.slice(0, EXCERPT_LENGTH)}…`;
}
