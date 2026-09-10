import { Readable } from 'node:stream';

import { ExtractorRegistry, EXTRACTORS } from './extractor.registry';
import { JsonExtractor } from './json.extractor';
import { TextExtractor } from './text.extractor';
import { mediaType } from './extractor';

const stream = (content: string) => Readable.from([Buffer.from(content)]);

const registry = new ExtractorRegistry([
  new TextExtractor(),
  new JsonExtractor(),
]);

describe('choosing an extractor', () => {
  it('ignores the parameters on a content type', () => {
    // A request arrives as `text/markdown; charset=utf-8`, and an extractor
    // asked whether it supports that verbatim would say no.
    expect(mediaType('text/markdown; charset=utf-8')).toBe('text/markdown');
    expect(registry.for('text/markdown; charset=utf-8')).toBeInstanceOf(
      TextExtractor,
    );
  });

  it('refuses a type nothing can read', () => {
    // 415 rather than a silent skip: a caller who sent a PDF should be told
    // mneme cannot read it, not left believing it was indexed.
    expect(() => registry.for('application/pdf')).toThrow(
      /cannot read application\/pdf/,
    );
  });
});

describe('text', () => {
  it('keeps Markdown syntax rather than stripping it', async () => {
    // A chunk that keeps its heading still says what it is about when it
    // comes back as a search result on its own.
    const { content } = await new TextExtractor().extract({
      stream: stream('# Title\n\n- a point'),
      contentType: 'text/markdown',
    });

    expect(content).toBe('# Title\n\n- a point');
  });

  it('records what it read, for the metadata on every chunk', async () => {
    const { metadata } = await new TextExtractor().extract({
      stream: stream('plain'),
      contentType: 'text/plain; charset=utf-8',
      filename: 'notes.txt',
    });

    expect(metadata).toEqual({
      contentType: 'text/plain',
      filename: 'notes.txt',
    });
  });
});

describe('json', () => {
  it('indents, so a chunk boundary falls between fields', async () => {
    // Minified JSON is one line, and a character splitter would cut it
    // mid-key into chunks carrying no field name with their value.
    const { content } = await new JsonExtractor().extract({
      stream: stream('{"title":"Standup","attendees":["Ada"]}'),
      contentType: 'application/json',
    });

    expect(content).toBe(
      '{\n  "title": "Standup",\n  "attendees": [\n    "Ada"\n  ]\n}',
    );
  });

  it('answers 400 for a body that is not the JSON it was announced as', async () => {
    // The caller said this was JSON. Letting a SyntaxError escape would
    // report their mistake as mneme's.
    await expect(
      new JsonExtractor().extract({
        stream: stream('{not json'),
        contentType: 'application/json',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('the registry as wired', () => {
  it('resolves every type it claims to support', () => {
    const wired = new ExtractorRegistry([
      new TextExtractor(),
      new JsonExtractor(),
    ]);

    for (const type of wired.supported()) {
      expect(() => wired.for(type)).not.toThrow();
    }
  });

  it('takes the token the module provides them under', () => {
    expect(EXTRACTORS).toBe('MNEME_EXTRACTORS');
  });
});
