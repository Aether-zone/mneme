import { uuidV5 } from './uuid';

/** The namespace RFC 4122 defines for DNS names. */
const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('uuidV5', () => {
  it('matches the published vector for the DNS namespace', () => {
    // From RFC 4122's own namespace and the example every implementation is
    // checked against. Getting this right is the whole reason not to write a
    // hash-to-hex function and call it a UUID.
    expect(uuidV5('python.org', DNS)).toBe(
      '886313e1-3b8a-5372-9b90-0c9aee199e5d',
    );
  });

  it('is stable, which is the only property that matters here', () => {
    expect(uuidV5('urn:doc:1#0', DNS)).toBe(uuidV5('urn:doc:1#0', DNS));
  });

  it('separates names that differ only in position', () => {
    expect(uuidV5('urn:doc:1#0', DNS)).not.toBe(uuidV5('urn:doc:1#1', DNS));
  });

  it('stamps the version and variant the spec requires', () => {
    const uuid = uuidV5('anything', DNS);

    expect(uuid[14]).toBe('5');
    expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
  });

  it('refuses a namespace that is not a UUID', () => {
    expect(() => uuidV5('name', 'not-a-uuid')).toThrow(/Not a UUID/);
  });
});
