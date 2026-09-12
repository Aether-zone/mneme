import {
  Inject,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { mediaType, type Extractor } from './extractor';

/** Every registered {@link Extractor}. */
export const EXTRACTORS = 'MNEME_EXTRACTORS';

/**
 * Picks the extractor for a content type.
 *
 * First match wins, so order in the provider array is precedence. A type
 * nothing supports is a 415 rather than a silent skip: a caller that sent a
 * PDF should be told mneme cannot read it, not left believing it was indexed.
 */
@Injectable()
export class ExtractorRegistry {
  constructor(
    @Inject(EXTRACTORS) private readonly extractors: Extractor[],
  ) {}

  /**
   * The extractor for a content type, or `null` where there is none.
   *
   * For callers to whom an unreadable type is not an error. The object listener
   * is the one that matters: the bucket holds every service's uploads, most of
   * them audio and PDFs mneme has no reader for, and being told about one is
   * the ordinary case rather than a fault. {@link for} is the answer for a
   * caller who *asked* mneme to read something and deserves to be told it
   * cannot.
   */
  find(contentType: string): Extractor | null {
    return (
      this.extractors.find((candidate) => candidate.supports(contentType)) ??
      null
    );
  }

  for(contentType: string): Extractor {
    const extractor = this.find(contentType);

    if (!extractor) {
      throw new UnsupportedMediaTypeException(
        `mneme cannot read ${mediaType(contentType)}. Supported: ${this.supported().join(', ')}.`,
      );
    }

    return extractor;
  }

  /** The media types something here claims, for an error message. */
  supported(): string[] {
    return ['text/plain', 'text/markdown', 'application/json'];
  }
}
