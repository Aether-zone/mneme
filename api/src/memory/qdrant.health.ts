import type { HealthCheckResult, HealthIndicator } from '@aether-zone/organon';
import { Inject, Injectable } from '@nestjs/common';

import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './embedding.provider';
import { QdrantVectorRepository } from './qdrant.vector-repository';

/**
 * Readiness for the store mneme cannot work without.
 *
 * Asking for the collection rather than pinging the server: a Qdrant that is
 * up but has lost the collection answers every search with nothing, which
 * looks like an empty memory rather than a broken one. This is the difference
 * between the two.
 *
 * Readiness, not liveness. A store that has gone away is a reason to stop
 * sending this instance traffic, not a reason to restart a process that is
 * working — restarting removes capacity exactly when the store returns.
 */
@Injectable()
export class QdrantHealth implements HealthIndicator {
  readonly name = 'vectorStore';

  constructor(
    private readonly repository: QdrantVectorRepository,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const model = this.embeddings.describe();

    try {
      const { vectors } = await this.repository.describeCollection();

      return { status: 'up', vectors, model };
    } catch (cause) {
      return { status: 'down', reason: describe(cause), model };
    }
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message && cause.message !== 'Error'
      ? `${cause.name}: ${cause.message}`
      : cause.name;
  }

  return 'Unknown failure';
}
