import {
  CurrentActor,
  OrganizationGuard,
  ZodValidationPipe,
  type Actor,
} from '@aether-zone/organon';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Readable } from 'node:stream';

import { ExtractorRegistry } from '../extract/extractor.registry';
import { MemoryService } from '../memory/memory.service';

import {
  ingestQuerySchema,
  resourceQuerySchema,
  searchQuerySchema,
  type IngestQuery,
  type SearchQuery,
} from './memory.dto';

/**
 * mneme's memory, over HTTP.
 *
 * Every route is under `/organizations/:organizationId` and guarded by
 * `OrganizationGuard`, which checks the id against the caller's `orgs` claim
 * and hands the handler an {@link Actor} narrowed to it. The handlers take the
 * organization from that actor rather than from the path parameter — the two
 * are equal by the time the guard has run, and reaching for the actor means a
 * route that ever loses its guard fails loudly instead of quietly querying an
 * organization nobody checked.
 */
@Controller('organizations/:organizationId/memory')
@UseGuards(OrganizationGuard)
export class MemoryController {
  constructor(
    private readonly memory: MemoryService,
    private readonly extractors: ExtractorRegistry,
  ) {}

  /** The passages closest to a question. */
  @Get('search')
  async search(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ) {
    const results = await this.memory.search(actor.organizationId, query.q, {
      limit: query.limit,
      minSimilarity: query.minSimilarity,
    });

    return {
      query: query.q,
      results: results.map(({ chunk, similarity }) => ({
        resourceUri: chunk.resourceUri,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        metadata: chunk.metadata,
        similarity,
      })),
    };
  }

  /**
   * Remembers a document sent as the request body.
   *
   * The body arrives raw and is read by content type, so the same endpoint
   * takes Markdown, plain text or JSON. Re-posting the same `uri` replaces
   * what was remembered under it.
   *
   * This is the manual path. The one that matters is the event listener —
   * anything the workspace announces is remembered without anybody posting it
   * here.
   */
  @Post('documents')
  async ingest(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(ingestQuerySchema)) query: IngestQuery,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
  ) {
    if (!contentType) {
      throw new BadRequestException(
        'Send a Content-Type; it is how mneme knows how to read the body.',
      );
    }

    const extractor = this.extractors.for(contentType);

    /*
     * Nest has already read the body by the time a handler runs, so this
     * rewraps it rather than streaming the socket. The extractor contract stays
     * stream-shaped because the path that will matter — a large object fetched
     * from loculus — must not begin by buffering; this endpoint is the small
     * case, and paying a copy here is cheaper than two contracts.
     */
    const { content, metadata } = await extractor.extract({
      stream: Readable.from([rawBody(body)]),
      contentType,
      filename: query.filename,
    });

    const result = await this.memory.index(
      actor.organizationId,
      query.uri,
      content,
      { metadata: { ...metadata, ingestedBy: actor.id } },
    );

    return result;
  }

  /** What is remembered of one resource, in order. */
  @Get('resources')
  async recall(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(resourceQuerySchema))
    query: { uri: string },
  ) {
    const chunks = await this.memory.recall(actor.organizationId, query.uri);

    return { resourceUri: query.uri, chunks };
  }

  /** Forgets a resource. Deleting what was never remembered is not an error. */
  @Delete('resources')
  @HttpCode(204)
  async forget(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(resourceQuerySchema))
    query: { uri: string },
  ): Promise<void> {
    await this.memory.forget(actor.organizationId, query.uri);
  }
}

/**
 * The body as bytes, whatever Nest made of it.
 *
 * A JSON body arrives parsed and a text body as a string; both are turned back
 * into the bytes the extractor expects. `JSON.stringify` here is not a
 * round-trip loss — the JSON extractor re-serialises anyway, precisely so a
 * minified document gains line breaks to be chunked on.
 */
function rawBody(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === 'string') {
    return Buffer.from(body, 'utf-8');
  }

  return Buffer.from(JSON.stringify(body ?? ''), 'utf-8');
}
