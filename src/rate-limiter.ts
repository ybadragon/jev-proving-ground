/**
 * A rate limiter that allows each caller a fixed number of requests within
 * a fixed time window.
 *
 * Each caller is tracked independently, keyed by an arbitrary string
 * identifier: one caller exhausting its allowance does not affect any
 * other caller. A caller's window starts on its first request in this
 * limiter (or its first request after a previous window elapsed) and
 * resets once `windowMs` has passed since that start.
 */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, CallerWindow>();

  constructor(maxRequests: number, windowMs: number) {
    if (!Number.isInteger(maxRequests) || maxRequests < 0) {
      throw new RangeError('maxRequests must be a non-negative integer');
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError('windowMs must be a positive number');
    }
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Whether `callerId` may make another request right now.
   *
   * A caller never seen before is allowed. Once the configured maximum has
   * been reached within the current window, further requests are refused
   * until the window resets and the caller's count starts again from zero.
   */
  allow(callerId: string, now: Date = new Date()): boolean {
    const nowMs = now.getTime();
    let window = this.windows.get(callerId);

    if (window === undefined || nowMs - window.startedAt >= this.windowMs) {
      window = { count: 0, startedAt: nowMs };
      this.windows.set(callerId, window);
    }

    if (window.count <= this.maxRequests) {
      window.count += 1;
      return true;
    }

    return false;
  }
}

interface CallerWindow {
  count: number;
  startedAt: number;
}
