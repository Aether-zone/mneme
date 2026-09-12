export const LOCULUS_CONFIG = 'LOCULUS_CONFIG';

/** Client credentials, for a token of mneme's own. */
export interface ServiceCredentials {
  /** pistis's token endpoint. */
  tokenUri: string;
  clientId: string;
  clientSecret: string;
}

/** Where loculus is, and what mneme presents to it. */
export interface LoculusConfig {
  /**
   * Origin of the loculus api, without a trailing slash.
   *
   * Reached server to server, so this is an *internal* address — unlike the
   * store endpoint loculus signs into the URLs it hands back, which has to be
   * one this process can also resolve, since mneme is the thing that spends
   * them.
   */
  baseUrl: string;
  /**
   * How long to wait for loculus, in milliseconds.
   *
   * Only for the presign call, which is arithmetic and one `HeadObject`.
   * Reading the object itself is deliberately not on this clock: a large file
   * legitimately takes longer than a slow answer does.
   */
  timeoutMs: number;
  /**
   * mneme's own credentials.
   *
   * **Not optional in the way the other services' are.** akouo and aether relay
   * the caller's token, because somebody is always waiting on the request that
   * makes them reach for one. Nothing here has a caller: an indexing run starts
   * from an event, long after every response has gone, so a token of mneme's
   * own is the only kind available. Undefined means this service cannot read
   * objects at all, which is a misconfiguration rather than a mode.
   */
  serviceCredentials?: ServiceCredentials;
}
