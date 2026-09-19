/**
 * An in-memory store of user sessions, each with its own time-to-live.
 *
 * Time is always supplied by the caller as a `now: Date`, the same way
 * `RateLimiter` takes its clock, so callers (and tests) control the passage
 * of time instead of this store reading the system clock itself.
 */

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

interface StoredSession {
  userId: string;
  ttlMs: number;
  expiresAt: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private nextId = 1;

  /**
   * Creates a session for `userId` that stays active for `ttlMs`
   * milliseconds from `now`, and returns its id.
   */
  create(userId: string, ttlMs: number, now: Date): string {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('ttlMs must be a positive number');
    }

    const id = `session-${this.nextId}`;
    this.nextId += 1;

    this.sessions.set(id, {
      userId,
      ttlMs,
      expiresAt: now.getTime() + ttlMs,
    });

    return id;
  }

  /**
   * Looks up a session by id.
   *
   * Returns `undefined` if the id is unknown, was revoked, or its TTL has
   * elapsed by `now`.
   */
  get(sessionId: string, now: Date): SessionRecord | undefined {
    const session = this.sessions.get(sessionId);
    if (session === undefined || this.isExpired(session, now)) {
      return undefined;
    }

    return {
      id: sessionId,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt),
    };
  }

  /**
   * Resets an active session's expiry to a full TTL measured from `now`.
   *
   * Returns `false` without effect if the id is unknown or the session has
   * already expired; an expired session is never resurrected.
   */
  refresh(sessionId: string, now: Date): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || this.isExpired(session, now)) {
      return false;
    }

    session.expiresAt = now.getTime() + session.ttlMs;
    return true;
  }

  /**
   * Revokes a session, making it unavailable to lookup immediately.
   *
   * A no-op if the id is unknown or was already revoked.
   */
  revoke(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * The number of sessions that are currently active as of `now`: created,
   * not yet expired, and not revoked.
   */
  activeCount(now: Date): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (!this.isExpired(session, now)) {
        count += 1;
      }
    }
    return count;
  }

  private isExpired(session: StoredSession, now: Date): boolean {
    return now.getTime() >= session.expiresAt;
  }
}
