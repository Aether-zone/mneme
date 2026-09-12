import { BadRequestException, Injectable } from '@nestjs/common';

import {
  mediaType,
  readAll,
  type ExtractionInput,
  type ExtractionResult,
  type Extractor,
} from './extractor';

/**
 * JSON, re-serialised with indentation.
 *
 * Parsing and re-printing is not cosmetic: minified JSON is one line, and a
 * character splitter would cut it mid-key into chunks that carry no field name
 * with their value. Indenting puts each field on its own line, so a chunk
 * boundary falls between fields far more often than through one.
 */
@Injectable()
export class JsonExtractor implements Extractor {
  supports(contentType: string): boolean {
    return mediaType(contentType) === 'application/json';
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const raw = await readAll(input.stream);

    try {
      return {
        content: JSON.stringify(JSON.parse(raw), null, 2),
        metadata: {
          contentType: 'application/json',
          filename: input.filename,
        },
      };
    } catch (cause) {
      // The caller said this was JSON. Answering 400 names their mistake;
      // letting a SyntaxError escape would report it as mneme's.
      throw new BadRequestException(
        `Body is not valid JSON: ${cause instanceof Error ? cause.message : 'unparseable'}`,
      );
    }
  }
}
