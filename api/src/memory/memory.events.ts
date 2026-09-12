/**
 * Routing keys mneme publishes under.
 *
 * Named rather than written at each call site: a publisher and a subscriber
 * that disagree fail silently — the message reaches the exchange, matches no
 * binding, and is dropped. Nothing errors and nothing arrives.
 */
export const MEMORY_INDEXED = 'memory.indexed';
export const MEMORY_FORGOTTEN = 'memory.forgotten';

/**
 * What mneme puts in an event's `source`.
 *
 * An IRI rather than the bare name, because `source` identifies the producer
 * across the whole workspace and a bare word is only unique by luck.
 *
 * **It is also load-bearing.** mneme's own `AetherEventListener` is bound to
 * `#` and indexes every resource the workspace announces — including, without
 * a guard, the memories mneme has just announced itself. That is not a slow
 * loop but a runaway one: each memory indexed produces a memory of the memory.
 * The listener drops anything carrying this source, and this constant is how
 * the two ends agree on what "mine" means.
 */
export const MNEME_SOURCE = 'https://aether.zone/mneme';
