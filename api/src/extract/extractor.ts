export interface ExtractionInput {
  stream: NodeJS.ReadableStream;
  contentType: string;
  filename?: string;
}

export interface ExtractionResult {
  /** The text to embed. */
  content: string;
  /** Remembered alongside it, and returned with every matching chunk. */
  metadata: Record<string, unknown>;
}

/**
 * Turns bytes of one content type into text worth embedding.
 *
 * Takes a stream rather than a string so that a large document need not be
 * held in memory twice. The extractors here consume the whole stream anyway —
 * text has to be complete before it can be split — but the seam is where a
 * PDF or an audio transcript would go, and those must not start by buffering.
 */
export interface Extractor {
  supports(contentType: string): boolean;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

/** Collects a stream into one UTF-8 string. */
export async function readAll(
  stream: NodeJS.ReadableStream,
): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * The media type without its parameters, lowercased.
 *
 * A request arrives as `text/markdown; charset=utf-8`, and an extractor asked
 * whether it supports that would say no.
 */
export function mediaType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}
