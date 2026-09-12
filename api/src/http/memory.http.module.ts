import { DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';

import { ExtractModule } from '../extract/extract.module';

import { MemoryController } from './memory.controller';

/**
 * The HTTP surface.
 *
 * The extractors the ingest endpoint reads bodies with come from
 * {@link ExtractModule}, shared with the object listener so that both paths
 * read the same set of content types.
 */
@Module({})
export class MemoryHttpModule {
  static register(imports: ModuleMetadata['imports']): DynamicModule {
    return {
      module: MemoryHttpModule,
      imports: [...(imports ?? []), ExtractModule],
      controllers: [MemoryController],
    };
  }
}
