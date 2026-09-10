import 'server-only';

import { apiGet } from './api';

/** One passage the api matched, as it comes back over the wire. */
export interface SearchHit {
  resourceUri: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  /** Cosine similarity, 0 to 1. */
  similarity: number;
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
}

/**
 * Searches the active organization's memory.
 *
 * The organization is not a parameter: `apiGet` resolves every path against
 * the one the person is working in, so there is no call site that could ask
 * the wrong tenant.
 */
export async function searchMemory(query: string) {
  return apiGet<SearchResponse>(
    `/memory/search?q=${encodeURIComponent(query)}&limit=20`,
  );
}

/**
 * A resource IRI, shortened for display.
 *
 * `urn:aether:meeting:9f3…` reads as `meeting 9f3…`: the scheme and the
 * vocabulary prefix are the same on every row, so they are the part carrying
 * no information.
 */
export function describeResource(uri: string): string {
  const parts = uri.split(':');

  if (parts.length < 2) {
    return uri;
  }

  const id = parts[parts.length - 1];
  const type = parts[parts.length - 2];

  return `${type} ${id}`;
}
