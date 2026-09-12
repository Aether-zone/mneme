import { DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';

import { ExtractorRegistry, EXTRACTORS } from '../extract/extractor.registry';
import { JsonExtractor } from '../extract/json.extractor';
import { TextExtractor } from '../extract/text.extractor';

import { MemoryController } from './memory.controller';

/**
 * The HTTP surface, and the extractors the ingest endpoint reads bodies with.
 *
 * Order in {@link EXTRACTORS} is precedence — the registry takes the first
 * that claims a content type.
 */
@Module({})
export class MemoryHttpModule {
  static register(imports: ModuleMetadata['imports']): DynamicModule {
    return {
      module: MemoryHttpModule,
      imports,
      controllers: [MemoryController],
      providers: [
        TextExtractor,
        JsonExtractor,
        {
          provide: EXTRACTORS,
          useFactory: (text: TextExtractor, json: JsonExtractor) => [
            text,
            json,
          ],
          inject: [TextExtractor, JsonExtractor],
        },
        ExtractorRegistry,
      ],
    };
  }
}
