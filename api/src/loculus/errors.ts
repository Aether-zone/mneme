/**
 * Failures whose answer is "stop", not "try again".
 *
 * The distinction the listener acts on. A consumer that requeues everything
 * spins: the broker redelivers immediately, the same thing fails, and a
 * permanent fault becomes a hot loop that fills the log and burns a core. So
 * anything that cannot come good on its own is raised as one of these, and the
 * listener acknowledges it rather than asking for it again.
 */

/**
 * loculus will not give mneme this object, and no retry changes that.
 *
 * `gone` — it was deleted between the event and the read. `forbidden` — loculus
 * does not offer it to this client, which for mneme means either no such object
 * or a token without `objects:read:any`.
 */
export class ObjectUnreadable extends Error {
  constructor(
    readonly objectKey: string,
    readonly reason: 'gone' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'ObjectUnreadable';
  }
}

/**
 * mneme cannot talk to loculus at all, and will not until somebody changes
 * something outside this process.
 *
 * Missing client credentials, a secret pistis rejects, a client not registered
 * for the grant. Distinct from an outage: a broker retry is exactly the right
 * answer to a store that is briefly down, and exactly the wrong one to a
 * credential that does not exist — every message in the queue would fail
 * identically, for ever, and the log would say so thousands of times.
 *
 * Raised loudly and acknowledged, so the queue drains and one clear error
 * stands in the log instead of a scroll of identical ones.
 */
export class Misconfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Misconfigured';
  }
}
