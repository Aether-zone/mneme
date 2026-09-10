import { DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';

import { AetherEventListener } from './aether-event.listener';

/**
 * The subscription to the shared exchange.
 *
 * Takes the configured `MemoryModule` as an import rather than registering one
 * of its own. Nest identifies a dynamic module by reference, so calling
 * `forRootAsync` again here would build a second embedding provider and a
 * second Qdrant client — both reading the same configuration to do the same
 * work, and both creating the collection at boot.
 */
@Module({})
export class EventsModule {
  static register(imports: ModuleMetadata['imports']): DynamicModule {
    return {
      module: EventsModule,
      imports,
      providers: [AetherEventListener],
    };
  }
}
