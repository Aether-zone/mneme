import {
  ENV,
  jwksUriFor,
  OrganonModule,
  PistisAuthModule,
  RabbitMqModule,
} from '@aether-zone/organon';
import { Module } from '@nestjs/common';

import { envSchema, type Env } from './env';
import { EventsModule } from './events/events.module';
import { MemoryHttpModule } from './http/memory.http.module';
import { MemoryModule } from './memory/memory.module';
import { QdrantHealth } from './memory/qdrant.health';

/*
 * Held in a variable and imported three times on purpose. Nest identifies a
 * dynamic module by reference, so calling `forRootAsync` again for the events
 * or the controllers would build a second embedding provider and a second
 * Qdrant client — each reading the same configuration to do the same work, and
 * each creating the collection at boot.
 */
const memory = MemoryModule.forRootAsync({
  inject: [ENV],
  useFactory: (env: Env) => ({
    qdrantUrl: env.QDRANT_URL,
    qdrantApiKey: env.QDRANT_API_KEY,
    collection: env.MNEME_COLLECTION,
    openAiApiKey: env.OPENAI_API_KEY,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    splitter: { chunkSize: env.CHUNK_SIZE, overlap: env.CHUNK_OVERLAP },
  }),
});

/**
 * mneme: what the workspace remembers.
 *
 * Two ways in. The event listener remembers whatever any service announces,
 * which is the one that matters; the HTTP surface is for searching it, and for
 * putting in a document that no event covers.
 */
@Module({
  imports: [
    OrganonModule.forRoot({
      config: { schema: envSchema },
      logging: { base: { service: 'mneme' } },
      // Wired, not merely enabled: an empty `health: {}` answers "up" while
      // the store it cannot reach makes every search return nothing.
      health: { indicators: [QdrantHealth], imports: [memory] },
    }),

    /*
     * Identity comes from pistis. mneme is a resource server: it verifies
     * tokens against pistis's published keys and issues none of its own.
     */
    PistisAuthModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        issuer: env.OAUTH_ISSUER,
        audience: env.OAUTH_AUDIENCE ?? env.OAUTH_ISSUER,
        jwksUri: env.OAUTH_JWKS_URI ?? jwksUriFor(env.OAUTH_ISSUER),
      }),
    }),

    /*
     * The shared exchange. mneme only subscribes — it announces nothing of its
     * own, because remembering something is not news to anyone else.
     */
    RabbitMqModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        uri: env.RABBITMQ_URI,
        exchange: env.RABBITMQ_EXCHANGE,
        connectTimeoutMs:
          env.RABBITMQ_CONNECT_TIMEOUT_MS === 0
            ? false
            : env.RABBITMQ_CONNECT_TIMEOUT_MS,
      }),
    }),

    memory,
    EventsModule.register([memory]),
    MemoryHttpModule.register([memory]),
  ],
})
export class AppModule {}
