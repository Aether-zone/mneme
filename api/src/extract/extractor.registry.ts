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

  for(contentType: string): Extractor {
    const extractor = this.extractors.find((candidate) =>
      candidate.supports(contentType),
    );

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
