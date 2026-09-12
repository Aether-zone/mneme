import {
  EMBEDDING_DIMENSIONS,
  type EmbeddingProvider,
} from './embedding.provider';

/**
 * A local stand-in for a real embedding model.
 *
 * **This is lexical, not semantic.** It is the hashing trick over word counts:
 * matching words score, and nothing else does. "car" and "automobile" are as
 * unrelated to it as "car" and "Thursday". Every claim an embedding is
 * supposed to make — that meaning survives paraphrase — is exactly what this
 * cannot do.
 *
 * It exists because the alternative is worse. Without it mneme cannot start,
 * cannot be tested, and cannot be demonstrated without an API key and a
 * network round trip per chunk; akouo makes the same trade with its mock
 * transcriber. What it buys is that the pipeline around the model — splitting,
 * storing, filtering by organization, re-indexing, deleting — is exercised for
 * real, against a real Qdrant, by tests that cost nothing and never flake.
 *
 * Never configure it in production. `MemoryModule` picks it only when
 * `OPENAI_API_KEY` is unset, and says so in the log at boot.
 */
export class HashingEmbeddingProvider implements EmbeddingProvider {
  embed(text: string): Promise<number[]> {
    return Promise.resolve(this.vector(text));
  }

  embedMany(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.vector(text)));
  }

  dimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  describe(): string {
    return 'hashing (lexical only — not a semantic model)';
  }

  private vector(text: string): number[] {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

    for (const token of tokenize(text)) {
      const hash = fnv1a(token);

      /*
       * A second bit of the same hash decides the sign. Two different words
       * landing in one bucket then cancel as often as they reinforce, instead
       * of always reinforcing — which is what keeps collisions from inventing
       * similarity that is not there.
       */
      const bucket = hash % EMBEDDING_DIMENSIONS;
      const sign = (hash >>> 31) & 1 ? -1 : 1;

      vector[bucket] += sign;
    }

    return normalize(vector);
  }
}

/** Lowercased runs of letters and digits. Punctuation is a separator. */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** FNV-1a, 32-bit. Chosen for being short and identical everywhere. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    // The FNV prime, as shifts: a plain `hash * 16777619` loses precision
    // above 2^53 and stops being the same function.
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return hash >>> 0;
}

/**
 * Scales to unit length, so cosine similarity depends on which words are
 * present rather than on how long the passage is. A zero vector — text with no
 * word characters at all — is returned as-is; Qdrant rejects it, which is the
 * correct outcome for something with nothing in it to match.
 */
function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((total, value) => total + value * value, 0),
  );

  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}
