import { CharacterTextSplitter } from './character.text-splitter';

const splitter = new CharacterTextSplitter({ chunkSize: 10, overlap: 3 });

describe('splitting', () => {
  it('returns one chunk when the text fits', () => {
    expect(splitter.split('short')).toEqual([{ content: 'short', index: 0 }]);
  });

  it('numbers the chunks in the order they were cut', () => {
    const chunks = splitter.split('a'.repeat(25));

    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1, 2, 3]);
  });

  it('repeats the tail of each chunk at the head of the next', () => {
    // The overlap is the whole point: a passage straddling a cut would
    // otherwise be findable in neither half.
    const [first, second] = splitter.split('0123456789abcdefghij');

    expect(first.content).toBe('0123456789');
    expect(second.content.startsWith('789')).toBe(true);
  });

  it('covers the text, so nothing falls between two chunks', () => {
    const content = 'the quick brown fox jumps over the lazy dog';
    const chunks = splitter.split(content);

    // Reassembling by dropping each overlap must give back the original.
    const rebuilt = chunks.reduce(
      (text, chunk, index) =>
        index === 0 ? chunk.content : text + chunk.content.slice(3),
      '',
    );

    expect(rebuilt).toBe(content);
  });

  it('treats whitespace as nothing to remember', () => {
    // Not "a document with no chunks" — not a document. Embedding it would
    // store a vector that matches everything weakly and nothing usefully.
    expect(splitter.split('   \n\t ')).toEqual([]);
    expect(splitter.split('')).toEqual([]);
  });
});

describe('configuration', () => {
  it('refuses an overlap that would never make progress', () => {
    // At or above the chunk size, the next start lands at or before this one
    // and the loop emits the same chunk for ever. Caught at construction so a
    // misconfiguration fails at boot rather than hanging the first document.
    expect(() => new CharacterTextSplitter({ chunkSize: 10, overlap: 10 })).toThrow(
      /overlap/,
    );
    expect(() => new CharacterTextSplitter({ chunkSize: 10, overlap: 11 })).toThrow(
      /overlap/,
    );
  });

  it('allows no overlap at all', () => {
    const cutting = new CharacterTextSplitter({ chunkSize: 4, overlap: 0 });

    expect(cutting.split('abcdefgh').map((c) => c.content)).toEqual([
      'abcd',
      'efgh',
    ]);
  });

  it('refuses a chunk size of nothing', () => {
    expect(() => new CharacterTextSplitter({ chunkSize: 0 })).toThrow(/chunkSize/);
  });
});
