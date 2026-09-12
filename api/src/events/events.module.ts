import { DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';

import { ExtractModule } from '../extract/extract.module';
import { LoculusModule } from '../loculus/loculus.module';

import { AetherEventListener } from './aether-event.listener';
import { ObjectUploadedListener } from './object-uploaded.listener';

/**
 * The subscriptions to the shared exchange.
 *
 * Two consumers, two queues, two things they listen for. `AetherEventListener`
 * takes every key and remembers what services *say* about their resources;
 * `ObjectUploadedListener` takes `object.uploaded` alone and remembers what
 * people *upload*. They share nothing but the memory they write into.
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
      imports: [...(imports ?? []), ExtractModule, LoculusModule],
      providers: [AetherEventListener, ObjectUploadedListener],
    };
  }
}
