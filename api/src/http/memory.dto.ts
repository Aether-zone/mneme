import { z } from 'zod';

/**
 * A search, as it arrives on the query string.
 *
 * Everything here is a string until zod coerces it — `?limit=5` is `'5'` — and
 * the bounds are what stop one request asking for the whole collection.
 */
export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Say what to search for.').max(1000),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  /**
   * Cosine similarity, 0 to 1. Defaulted rather than left open because a
   * vector search always returns its `limit` — there is no "no match", only a
   * worst match, and without a floor the tenth result is noise presented
   * exactly like the first.
   */
  minSimilarity: z.coerce.number().min(0).max(1).default(0.2),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** Where an ingested document is filed, and what it is called. */
export const ingestQuerySchema = z.object({
  /**
   * The resource IRI to remember this under. Re-posting the same one replaces
   * what was remembered, which is why the caller has to choose it rather than
   * being handed a generated id.
   */
  uri: z.string().min(1).max(1000),
  filename: z.string().min(1).max(255).optional(),
});

export type IngestQuery = z.infer<typeof ingestQuerySchema>;

/** The IRI of a resource to forget. */
export const resourceQuerySchema = z.object({
  uri: z.string().min(1).max(1000),
});
