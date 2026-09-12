import { Module } from '@nestjs/common';

import { ExtractorRegistry, EXTRACTORS } from './extractor.registry';
import { JsonExtractor } from './json.extractor';
import { TextExtractor } from './text.extractor';

/**
 * The readers, and the registry that picks between them.
 *
 * Its own module because there are now two callers — the HTTP ingest endpoint
 * and the object listener — and the list of extractors must be one list. Two
 * modules each providing their own would drift: a reader added for uploads
 * would silently not apply to a posted body, and the difference would show up
 * as "mneme indexed my PDF from the bucket but 415s when I post one".
 *
 * A plain `@Module`, so Nest gives every importer the same instance. Order in
 * {@link EXTRACTORS} is precedence — the registry takes the first that claims a
 * content type.
 */
@Module({
  providers: [
    TextExtractor,
    JsonExtractor,
    {
      provide: EXTRACTORS,
      useFactory: (text: TextExtractor, json: JsonExtractor) => [text, json],
      inject: [TextExtractor, JsonExtractor],
    },
    ExtractorRegistry,
  ],
  exports: [ExtractorRegistry],
})
export class ExtractModule {}
