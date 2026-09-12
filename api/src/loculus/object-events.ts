import { z } from 'zod';

/**
 * The events loculus publishes about objects, as mneme reads them.
 *
 * **Declared here rather than imported.** `@aether-zone/organon` is a published
 * package and carries the shared *vocabulary* — `AetherEvent` — while this is
 * one service's private announcement about its own storage; loculus declares it
 * in its own source, and aether and akouo each keep their own copy for the same
 * reason. So the ends agree by convention, and the schema below is what holds
 * mneme to its half: a producer that renames a field gets a logged drop here
 * rather than an `undefined` reaching the extractor.
 */

/** Routing key. Must match loculus's `OBJECT_UPLOADED`. */
export const OBJECT_UPLOADED = 'object.uploaded';

/**
 * The bytes for a key are in the store.
 *
 * Says *that the object exists*, not that it has just been written: loculus
 * publishes it from the bucket's notification within seconds of the upload, and
 * from its own sweep later for the uploads that notification never came for.
 * Either way mneme's answer is the same, which is why nothing branches on it.
 *
 * `organizationId` is nullable and mneme requires it — see the listener. A
 * service upload carries no organization claim to state, and there is nothing
 * to file such an object under.
 *
 * `id` and `occurredAt` are the transport envelope organon stamps on everything
 * it publishes. Optional because they belong to the transport rather than to
 * this event.
 */
export const objectUploadedSchema = z.object({
  objectKey: z.string().min(1),
  /** The filename as declared at presign. Kept as chunk metadata. */
  name: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  organizationId: z.string().min(1).nullish(),
  id: z.string().min(1).optional(),
  occurredAt: z.iso.datetime().optional(),
});

export type ObjectUploadedEvent = z.infer<typeof objectUploadedSchema>;

/**
 * What mneme calls a stored object when it remembers one.
 *
 * A URN rather than the bare key, because `resourceUri` is one namespace shared
 * with every other thing mneme indexes — meetings, people, documents announced
 * as Aether events — and a bare `loculus/org/uuid-notes.md` sitting among IRIs
 * would be the one entry whose origin has to be guessed. The key is stable and
 * unique, so it makes a good tail.
 */
export const objectUri = (objectKey: string): string =>
  `urn:aether:object:${objectKey}`;
