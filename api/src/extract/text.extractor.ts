import { Injectable } from '@nestjs/common';

import {
  mediaType,
  readAll,
  type ExtractionInput,
  type ExtractionResult,
  type Extractor,
} from './extractor';

/**
 * Plain text and Markdown, taken as they are.
 *
 * Markdown is deliberately *not* stripped of its syntax. Headings and list
 * markers are part of how the text reads, and a chunk that keeps its heading
 * is a chunk that still says what it is about when it comes back as a search
 * result on its own.
 */
@Injectable()
export class TextExtractor implements Extractor {
  private static readonly TYPES = ['text/plain', 'text/markdown', 'text/x-markdown'];

  supports(contentType: string): boolean {
    return TextExtractor.TYPES.includes(mediaType(contentType));
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    return {
      content: await readAll(input.stream),
      metadata: {
        contentType: mediaType(input.contentType),
        filename: input.filename,
      },
    };
  }
}
