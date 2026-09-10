import { Injectable } from '@nestjs/common';

import type { Chunk, TextSplitter } from './chunk';

/** Characters per chunk, and how much each one repeats of the last. */
export interface CharacterTextSplitterOptions {
  chunkSize?: number;
  overlap?: number;
}

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_OVERLAP = 200;

/**
 * Cuts on character count alone.
 *
 * Crude on purpose: it makes no assumption about the text, so it behaves the
 * same on prose, JSON and a transcript. A splitter that broke on sentences
 * would do better on the first and worse on the others, and mneme indexes
 * whatever the workspace announces.
 *
 * **The overlap is the point.** A passage that straddles a cut would otherwise
 * be findable in neither half — each holds a fragment that answers nothing. The
 * default repeats the last 200 characters of each chunk at the start of the
 * next, so a sentence has to be longer than the overlap to be lost.
 */
@Injectable()
export class CharacterTextSplitter implements TextSplitter {
  private readonly chunkSize: number;
  private readonly overlap: number;

  constructor(options: CharacterTextSplitterOptions = {}) {
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.overlap = options.overlap ?? DEFAULT_OVERLAP;

    if (this.chunkSize <= 0) {
      throw new Error('chunkSize must be positive.');
    }

    /*
     * An overlap at or above the chunk size makes no progress: the next start
     * would land at or before this one, and the loop would emit the same chunk
     * for ever. Refused at construction rather than guarded in the loop, so a
     * misconfiguration fails at boot instead of hanging the first document.
     */
    if (this.overlap < 0 || this.overlap >= this.chunkSize) {
      throw new Error(
        `overlap must be between 0 and chunkSize - 1 (got ${this.overlap} for a chunk size of ${this.chunkSize}).`,
      );
    }
  }

  split(content: string): Chunk[] {
    // Nothing but whitespace is not a document with no chunks in it; it is not
    // a document. Embedding it would store a vector that matches everything
    // weakly and nothing usefully.
    if (!content.trim()) {
      return [];
    }

    const chunks: Chunk[] = [];

    let start = 0;
    let index = 0;

    while (start < content.length) {
      const end = Math.min(start + this.chunkSize, content.length);

      chunks.push({ content: content.slice(start, end), index });

      index++;

      if (end === content.length) {
        break;
      }

      start = end - this.overlap;
    }

    return chunks;
  }
}
