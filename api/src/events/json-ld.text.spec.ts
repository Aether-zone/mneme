import type { JsonLdDocument } from '@aether-zone/organon';

import { documentToText } from './json-ld.text';

const CONTEXT = {
  aether: 'https://aether.zone/vocab/',
  participant: 'aether:participant',
};

const meeting = (over: Record<string, unknown> = {}): JsonLdDocument => ({
  '@context': CONTEXT,
  '@id': 'urn:aether:meeting:1',
  '@type': 'aether:Meeting',
  title: 'Standup',
  ...over,
});

describe('what gets read', () => {
  it('leads with the type, so a chunk says what it is about', () => {
    expect(documentToText(meeting())).toBe('Meeting\ntitle: Standup');
  });

  it('keeps the label beside the value', () => {
    // A bare value embeds as well, but search results are read by people and
    // "Sprint review" alone does not say what it is the name of.
    const text = documentToText(meeting({ description: 'Daily sync' }));

    expect(text).toContain('description: Daily sync');
  });

  it('leaves the document’s own machinery out', () => {
    const text = documentToText(meeting());

    expect(text).not.toContain('urn:aether:meeting:1');
    expect(text).not.toContain('@context');
  });
});

describe('references', () => {
  it('drops a bare pointer, which carries no words', () => {
    // An opaque IRI adds a token nobody would ever type and dilutes the
    // vector of everything around it. arachni is where that edge is kept.
    const text = documentToText(
      meeting({ participant: { '@id': 'urn:aether:person:7' } }),
    );

    expect(text).toBe('Meeting\ntitle: Standup');
  });

  it('reads a nested resource that has something to say', () => {
    const text = documentToText(
      meeting({
        participations: [
          {
            '@id': 'urn:aether:participation:1',
            '@type': 'aether:Participation',
            role: 'host',
            participant: { '@id': 'urn:aether:person:7' },
          },
        ],
      }),
    );

    // Flattened with a path prefix rather than indented: indenting puts the
    // context on a line the chunker may cut away from the value.
    expect(text).toContain('participations.role: host');
  });
});

describe('shapes that would otherwise break it', () => {
  it('writes one line per array entry', () => {
    const text = documentToText(meeting({ tag: ['planning', 'weekly'] }));

    expect(text).toContain('tag: planning');
    expect(text).toContain('tag: weekly');
  });

  it('resolves a term through the context to its readable name', () => {
    // `participant` maps to `aether:participant`, whose local name is what a
    // reader recognises.
    const text = documentToText(
      meeting({
        participant: { '@id': 'urn:aether:person:7', name: 'Ada' },
      }),
    );

    expect(text).toContain('participant.name: Ada');
  });

  it('skips null and empty values rather than writing a bare label', () => {
    const text = documentToText(
      meeting({ description: null, summary: '', note: '   ' }),
    );

    expect(text).toBe('Meeting\ntitle: Standup');
  });

  it('renders numbers and booleans, which are content too', () => {
    const text = documentToText(meeting({ duration: 30, recorded: true }));

    expect(text).toContain('duration: 30');
    expect(text).toContain('recorded: true');
  });

  it('survives a document with no type at all', () => {
    const text = documentToText({
      '@id': 'urn:aether:thing:1',
      note: 'kept',
    } as JsonLdDocument);

    expect(text).toBe('note: kept');
  });
});
