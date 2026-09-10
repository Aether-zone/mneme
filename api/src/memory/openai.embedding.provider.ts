import { Logger } from '@nestjs/common';

/*
 * `ai` and `@ai-sdk/openai` are ESM-only and this build is CommonJS, so a value
 * import of either cannot happen at the top of the file. The types are imported
 * with an explicit resolution mode, and the values inside the calls that use
 * them — the same arrangement akouo's AIProvider uses, for the same reason.
 */
import type { EmbeddingModelV4 } from '@ai-sdk/provider' with { 'resolution-mode': 'import' };

import {
  EMBEDDING_DIMENSIONS,
  type EmbeddingProvider,
} from './embedding.provider';

export interface OpenAiEmbeddingOptions {
  apiKey: string;
  /** Changing this invalidates every vector already stored. */
  model: string;
}

/**
 * Embeddings from OpenAI, through the AI SDK.
 *
 * The model is resolved once and reused. `text-embedding-3-small` returns 1536
 * dimensions, which is what {@link EMBEDDING_DIMENSIONS} is; a model of another
 * width needs that constant and the collection changed together.
 */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OpenAiEmbeddingProvider.name);

  /** Resolved on first use, then reused. */
  private model?: EmbeddingModelV4;

  constructor(private readonly options: OpenAiEmbeddingOptions) {}

  async embed(text: string): Promise<number[]> {
    const { embed } = await import('ai');

    const { embedding } = await embed({
      model: await this.embeddingModel(),
      value: text,
    });

    return embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const { embedMany } = await import('ai');

    const { embeddings } = await embedMany({
      model: await this.embeddingModel(),
      values: texts,
    });

    return embeddings;
  }

  dimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  describe(): string {
    return `openai:${this.options.model}`;
  }

  private async embeddingModel(): Promise<EmbeddingModelV4> {
    if (!this.model) {
      const { createOpenAI } = await import('@ai-sdk/openai');

      this.model = createOpenAI({ apiKey: this.options.apiKey }).embedding(
        this.options.model,
      );

      this.logger.log(`Embedding with ${this.describe()}`);
    }

    return this.model;
  }
}
