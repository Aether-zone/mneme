import { createHash } from 'node:crypto';

/**
 * A version 5 UUID: the SHA-1 of a namespace and a name, per RFC 4122 §4.3.
 *
 * Hand-rolled rather than taken from the `uuid` package, which is ESM-only
 * from v14 and cannot be required by this CommonJS build — a real constraint
 * rather than a preference, since jest reports it as a suite that will not
 * load. Twenty lines of a fixed specification is a better trade than a
 * dependency that forces the module system.
 *
 * The point of v5 over v4 here is that it is *derived*: the same name always
 * gives the same id, which is what lets re-indexing a document overwrite its
 * chunks instead of writing a second copy beside them.
 */
export function uuidV5(name: string, namespace: string): string {
  const bytes = createHash('sha1')
    .update(parseUuid(namespace))
    .update(Buffer.from(name, 'utf-8'))
    .digest()
    // SHA-1 gives 20 bytes; a UUID is the first 16.
    .subarray(0, 16);

  // Version 5 in the high nibble of byte 6, and the RFC 4122 variant in the
  // top two bits of byte 8. Everything else is hash.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** The 16 bytes of a UUID in its usual dashed form. */
function parseUuid(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');

  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`Not a UUID: ${uuid}`);
  }

  return Buffer.from(hex, 'hex');
}
