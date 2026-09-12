/**
 * Turns text into a vector.
 *
 * An interface rather than the OpenAI client directly, because which model
 * mneme embeds with is a deployment decision and a test should not need a
 * network. {@link HashingEmbeddingProvider} is the implementation that needs
 * neither.
 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;

  /**
   * Embeds a batch. Separate from {@link embed} because a real provider
   * charges per request as well as per token, and a hundred chunks is one
   * call rather than a hundred.
   */
  embedMany(texts: string[]): Promise<number[][]>;

  /**
   * Length of the vectors this provider produces. The collection is created
   * with this width, and a provider that disagrees with the stored collection
   * cannot be used against it — see `QdrantVectorRepository.ensureCollection`.
   */
  dimensions(): number;

  /** Names the model in the health report and in a mismatch message. */
  describe(): string;
}

/** DI token for the configured {@link EmbeddingProvider}. */
export const EMBEDDING_PROVIDER = 'MNEME_EMBEDDING_PROVIDER';

/**
 * The width every provider here produces.
 *
 * Fixed across implementations so that swapping one for another does not also
 * require recreating the collection. It does still invalidate what is stored —
 * two models' vectors are not comparable, whatever their length — but that is a
 * re-index rather than a migration.
 */
export const EMBEDDING_DIMENSIONS = 1536;
