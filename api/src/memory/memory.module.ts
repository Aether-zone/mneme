import { type AsyncModuleConfig } from '@aether-zone/organon';
import {
  DynamicModule,
  Inject,
  Logger,
  Module,
  type OnModuleInit,
  type Provider,
} from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

import {
  CharacterTextSplitter,
  type CharacterTextSplitterOptions,
} from './character.text-splitter';
import { TEXT_SPLITTER } from './chunk';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from './embedding.provider';
import { HashingEmbeddingProvider } from './hashing.embedding.provider';
import { MemoryService } from './memory.service';
import { OpenAiEmbeddingProvider } from './openai.embedding.provider';
import { QdrantHealth } from './qdrant.health';
import { QdrantVectorRepository } from './qdrant.vector-repository';
import { VECTOR_REPOSITORY } from './vector';

export interface MemoryConfig {
  qdrantUrl: string;
  qdrantApiKey?: string;
  collection: string;
  /** Unset, mneme embeds with {@link HashingEmbeddingProvider} instead. */
  openAiApiKey?: string;
  embeddingModel: string;
  splitter?: CharacterTextSplitterOptions;
}

export const MEMORY_CONFIG = 'MNEME_MEMORY_CONFIG';

/**
 * The memory: an embedding model, a splitter, and somewhere to put the result.
 *
 * Exported rather than global so that a module wanting `MemoryService` has to
 * import this one and say so.
 */
@Module({})
export class MemoryModule implements OnModuleInit {
  private static readonly logger = new Logger(MemoryModule.name);

  constructor(
    private readonly repository: QdrantVectorRepository,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  static forRootAsync(options: AsyncModuleConfig<MemoryConfig>): DynamicModule {
    const providers: Provider[] = [
      {
        provide: MEMORY_CONFIG,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      {
        provide: EMBEDDING_PROVIDER,
        useFactory: (config: MemoryConfig): EmbeddingProvider => {
          if (!config.openAiApiKey) {
            /*
             * Loud, and at boot rather than at the first search. A memory that
             * silently matches on shared words instead of shared meaning is
             * the kind of wrong that looks like it is working.
             */
            MemoryModule.logger.warn(
              'OPENAI_API_KEY is not set: embedding locally with the hashing provider, ' +
                'which matches words rather than meaning. Do not use this in production.',
            );

            return new HashingEmbeddingProvider();
          }

          return new OpenAiEmbeddingProvider({
            apiKey: config.openAiApiKey,
            model: config.embeddingModel,
          });
        },
        inject: [MEMORY_CONFIG],
      },
      {
        provide: QdrantClient,
        useFactory: (config: MemoryConfig) =>
          new QdrantClient({
            url: config.qdrantUrl,
            apiKey: config.qdrantApiKey,
          }),
        inject: [MEMORY_CONFIG],
      },
      {
        provide: QdrantVectorRepository,
        useFactory: (client: QdrantClient, config: MemoryConfig) =>
          new QdrantVectorRepository(client, config.collection),
        inject: [QdrantClient, MEMORY_CONFIG],
      },
      { provide: VECTOR_REPOSITORY, useExisting: QdrantVectorRepository },
      {
        provide: TEXT_SPLITTER,
        useFactory: (config: MemoryConfig) =>
          new CharacterTextSplitter(config.splitter),
        inject: [MEMORY_CONFIG],
      },
      MemoryService,
      QdrantHealth,
    ];

    return {
      module: MemoryModule,
      imports: options.imports ?? [],
      providers,
      exports: [
        MemoryService,
        QdrantHealth,
        QdrantVectorRepository,
        EMBEDDING_PROVIDER,
        VECTOR_REPOSITORY,
        TEXT_SPLITTER,
      ],
    };
  }

  /**
   * Creates the collection before anything tries to write to it.
   *
   * At boot rather than lazily on the first write: a collection whose vectors
   * are the wrong width is a configuration error, and it should stop the
   * service starting rather than fail one document at a time.
   */
  async onModuleInit(): Promise<void> {
    await this.repository.ensureCollection(
      this.embeddings.dimensions(),
      this.embeddings.describe(),
    );
  }
}
