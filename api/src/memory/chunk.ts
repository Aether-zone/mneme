/** A slice of a document, in the order it was cut. */
export interface Chunk {
  content: string;
  index: number;
}

/**
 * Cuts a document into pieces small enough to embed.
 *
 * An embedding model has a token limit, and a vector averaged over a whole
 * document says very little about any part of it — the passage that answers a
 * question is what should be findable, not the file it happens to live in.
 */
export interface TextSplitter {
  split(content: string): Chunk[];
}

/** DI token for the configured {@link TextSplitter}. */
export const TEXT_SPLITTER = 'MNEME_TEXT_SPLITTER';
