import type { JsonLdContext, JsonLdDocument } from '@aether-zone/organon';

/**
 * Renders a JSON-LD document as text worth embedding.
 *
 * This is mneme's counterpart to arachni's mapper: given the same document,
 * arachni asks what the edges are and mneme asks what the words are. Neither
 * knows what a Meeting is — both work from the shape of the document and its
 * `@context`, so a resource type nobody has heard of still indexes.
 *
 * Three decisions shape the output:
 *
 * **Labels are kept.** A bare value embeds as well as its label does, but a
 * chunk that reads `title: Sprint review` tells a *reader* what they are
 * looking at when it comes back as a search result, and search results are read
 * by people.
 *
 * **Bare references are dropped.** `{ '@id': 'urn:aether:person:7' }` carries
 * no words. Embedding an opaque IRI adds a token that matches nothing anyone
 * would type, and dilutes the vector of everything around it. arachni is where
 * that edge is worth keeping; here it is noise.
 *
 * **Nesting is flattened with a path prefix**, so a participation's role reads
 * as `participations.role: host`. The alternative — indenting — puts the
 * context on a line the chunker may cut away from the value.
 */
export function documentToText(document: JsonLdDocument): string {
  const lines: string[] = [];

  const type = localName(asString(document['@type']));

  if (type) {
    lines.push(type);
  }

  render(document, document['@context'], '', lines);

  return lines.join('\n').trim();
}

function render(
  resource: Record<string, unknown>,
  parentContext: JsonLdContext | undefined,
  prefix: string,
  lines: string[],
): void {
  // A nested resource may declare its own context, and it wins over the one it
  // inherits — the spec's rule, and why this is threaded down.
  const context: JsonLdContext = {
    ...(parentContext ?? {}),
    ...((resource['@context'] as JsonLdContext | undefined) ?? {}),
  };

  for (const [property, value] of Object.entries(resource)) {
    // `@id`, `@type` and `@context` are the document's machinery, not its
    // content. The type is already the first line.
    if (property.startsWith('@')) {
      continue;
    }

    const label = prefix
      ? `${prefix}.${localName(resolve(property, context))}`
      : localName(resolve(property, context));

    write(label, value, context, lines);
  }
}

function write(
  label: string,
  value: unknown,
  context: JsonLdContext,
  lines: string[],
): void {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      write(label, item, context, lines);
    }

    return;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);

    // A bare `{ '@id': … }`: a pointer with nothing to read. See above.
    if (keys.length === 1 && keys[0] === '@id') {
      return;
    }

    render(value as Record<string, unknown>, context, label, lines);

    return;
  }

  /*
   * Strings, numbers and booleans are content; a symbol or a function in a
   * document is not, and would stringify to something no one would search for.
   * Narrowed explicitly rather than falling through to `String(unknown)`,
   * which is how "[object Object]" ends up embedded as a fact.
   */
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return;
  }

  const text = String(value).trim();

  if (text) {
    lines.push(`${label}: ${text}`);
  }
}

/** A term's IRI, where the context defines one. */
function resolve(property: string, context: JsonLdContext): string {
  return context[property] ?? property;
}

/**
 * The readable tail of an IRI or prefixed name: `aether:Meeting` and
 * `https://aether.zone/vocab/Meeting` both read as `Meeting`.
 */
function localName(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const afterSlash = value.split('/').pop() ?? value;
  const afterHash = afterSlash.split('#').pop() ?? afterSlash;

  return afterHash.split(':').pop() ?? afterHash;
}

/** The first `@type`, where a document gives several. */
function asString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }

  return typeof value === 'string' ? value : undefined;
}
