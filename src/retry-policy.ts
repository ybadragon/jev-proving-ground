/**
 * Runs an async operation, retrying it with exponential backoff and jitter
 * when it fails.
 *
 * The delay before each retry doubles with every successive attempt (full
 * jitter: a random value between `0` and the doubled base, capped at
 * `maxDelayMs`), so many callers failing at the same instant do not all
 * retry in lockstep, and no single caller waits unboundedly long.
 */

export interface RetryAttemptInfo {
  /** The attempt number that is about to run, starting at `2` for the first retry. */
  readonly attempt: number;
  /** The error from the previous, failed attempt. */
  readonly error: unknown;
  /** How long, in milliseconds, the policy is waiting before this attempt. */
  readonly delayMs: number;
}

export interface RetryPolicyOptions {
  /** The maximum number of attempts, including the first. Must be at least `1`. */
  readonly maxAttempts: number;
  /** The delay before the first retry, in milliseconds. Must be positive. */
  readonly baseDelayMs: number;
  /** The largest delay the policy will ever wait, in milliseconds. Must be at least `baseDelayMs`. */
  readonly maxDelayMs: number;
  /** Called before each retry (not before the first attempt). */
  readonly onRetry?: (info: RetryAttemptInfo) => void;
  /** Source of randomness for jitter, returning a value in `[0, 1)`. Defaults to `Math.random`. */
  readonly random?: () => number;
  /** Performs the actual wait. Defaults to a real `setTimeout`-based sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export type RetryResult<T> =
  | { readonly outcome: 'succeeded'; readonly value: T; readonly attempts: number }
  | { readonly outcome: 'gaveUp'; readonly error: unknown; readonly attempts: number };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The delay for a given retry attempt, before jitter is applied.
 *
 * `attempt` is the attempt that is about to run (the first retry is `2`),
 * so the first retry backs off by one multiple of `baseDelayMs` and each
 * subsequent retry doubles the previous one.
 */
function uncappedDelayFor(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** (attempt - 2);
}

/**
 * Runs `operation`, retrying with exponential backoff and full jitter until
 * it succeeds or `maxAttempts` has been used up.
 */
export async function runWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryPolicyOptions,
): Promise<RetryResult<T>> {
  const { maxAttempts, baseDelayMs, maxDelayMs, onRetry } = options;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer');
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs <= 0) {
    throw new RangeError('baseDelayMs must be a positive number');
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new RangeError('maxDelayMs must be at least baseDelayMs');
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await operation(attempt);
      return { outcome: 'succeeded', value, attempts: attempt };
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      const nextAttempt = attempt + 1;
      const cappedDelay = Math.min(uncappedDelayFor(attempt, baseDelayMs), maxDelayMs);
      const delayMs = random() * cappedDelay;

      onRetry?.({ attempt: nextAttempt, error, delayMs });
      await sleep(delayMs);
    }
  }

  return { outcome: 'gaveUp', error: lastError, attempts: maxAttempts };
}
