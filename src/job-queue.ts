import { randomUUID } from 'node:crypto';

/**
 * Where a job sits in its lifecycle.
 *
 * `queued` -> `running` -> `done`
 *                        -> `queued` (retried) or `failed`
 */
export type JobState = 'queued' | 'running' | 'done' | 'failed';

/** A snapshot of a job at a point in time. Mutating it has no effect on the queue. */
export interface Job<TPayload = unknown, TResult = unknown> {
  readonly id: string;
  readonly payload: TPayload;
  readonly priority: number;
  readonly retryLimit: number;
  readonly state: JobState;
  readonly failureCount: number;
  readonly result: TResult | undefined;
  readonly error: unknown;
  readonly createdAt: Date;
  readonly claimedAt: Date | null;
}

export interface SubmitOptions {
  /** Jobs with a higher priority are handed out before lower ones. Defaults to `0`. */
  readonly priority?: number;
  /** How many times this job may fail and go back to `queued` before it is left `failed`. Defaults to `0`. */
  readonly retryLimit?: number;
}

export type JobCounts = Record<JobState, number>;

export interface JobQueueOptions {
  /**
   * How long, in milliseconds, a worker may hold a claimed job before it is
   * considered abandoned. Defaults to `Infinity`, which disables abandonment
   * detection entirely.
   */
  readonly claimTimeoutMs?: number;
}

interface InternalJob<TPayload, TResult> {
  id: string;
  payload: TPayload;
  priority: number;
  retryLimit: number;
  state: JobState;
  failureCount: number;
  result: TResult | undefined;
  error: unknown;
  createdAt: Date;
  claimedAt: Date | null;
  /** Insertion order, used to break priority ties and to sort listings. */
  seq: number;
}

/**
 * An in-memory job queue with priority ordering and bounded retries.
 *
 * Jobs are handed out highest-priority first, oldest first among equal
 * priorities. A worker claims a job, then reports back with either a result
 * or an error; a failure goes back to `queued` until the job's retry limit
 * is used up, at which point it is left `failed`.
 *
 * This queue lives entirely in memory: it does not persist across process
 * restarts and does not coordinate across processes.
 */
export class JobQueue<TPayload = unknown, TResult = unknown> {
  private readonly claimTimeoutMs: number;
  private readonly jobs = new Map<string, InternalJob<TPayload, TResult>>();
  private nextSeq = 0;

  constructor(options: JobQueueOptions = {}) {
    const claimTimeoutMs = options.claimTimeoutMs ?? Infinity;
    if (Number.isNaN(claimTimeoutMs) || claimTimeoutMs <= 0) {
      throw new RangeError('claimTimeoutMs must be a positive number');
    }
    this.claimTimeoutMs = claimTimeoutMs;
  }

  /**
   * Submits `payload` as a new job and returns its id.
   *
   * The job starts `queued`. `priority` and `retryLimit` default to `0`,
   * meaning a job with no options set is handed out no sooner than any
   * other default-priority job and is left `failed` on its first failure.
   */
  submit(payload: TPayload, options: SubmitOptions = {}): string {
    const priority = options.priority ?? 0;
    const retryLimit = options.retryLimit ?? 0;

    if (!Number.isFinite(priority)) {
      throw new RangeError('priority must be a finite number');
    }
    if (!Number.isInteger(retryLimit) || retryLimit < 0) {
      throw new RangeError('retryLimit must be a non-negative integer');
    }

    const id = randomUUID();
    this.jobs.set(id, {
      id,
      payload,
      priority,
      retryLimit,
      state: 'queued',
      failureCount: 0,
      result: undefined,
      error: undefined,
      createdAt: new Date(),
      claimedAt: null,
      seq: this.nextSeq++,
    });
    return id;
  }

  /**
   * Claims the next available job for a worker, or `undefined` if none is
   * queued.
   *
   * Among queued jobs, the highest `priority` wins; ties go to whichever
   * was submitted first. Claiming moves the job to `running` and records
   * `now` as when it was claimed, so it is never handed to a second worker
   * until it is retried, reaped, or completed.
   */
  claim(now: Date = new Date()): Job<TPayload, TResult> | undefined {
    let best: InternalJob<TPayload, TResult> | undefined;

    for (const job of this.jobs.values()) {
      if (job.state !== 'queued') {
        continue;
      }
      if (
        best === undefined ||
        job.priority > best.priority ||
        (job.priority === best.priority && job.seq < best.seq)
      ) {
        best = job;
      }
    }

    if (best === undefined) {
      return undefined;
    }

    best.state = 'running';
    best.claimedAt = now;
    return toJobView(best);
  }

  /**
   * Records `result` for job `id` and moves it to `done`.
   *
   * Returns `false` without effect if `id` is unknown or the job is not
   * currently `running` — only the worker holding a claimed job can
   * complete it.
   */
  complete(id: string, result: TResult): boolean {
    const job = this.jobs.get(id);
    if (job === undefined || job.state !== 'running') {
      return false;
    }
    job.state = 'done';
    job.result = result;
    job.claimedAt = null;
    return true;
  }

  /**
   * Records `error` for job `id` and either sends it back to `queued` for
   * another attempt or leaves it `failed`, depending on `retryLimit`.
   *
   * A job that has failed fewer times than its retry limit goes back to
   * `queued`; once it has used up its retries, it is left `failed`. Returns
   * `false` without effect if `id` is unknown or the job is not currently
   * `running`.
   */
  fail(id: string, error: unknown): boolean {
    const job = this.jobs.get(id);
    if (job === undefined || job.state !== 'running') {
      return false;
    }

    job.error = error;
    const willRetry = job.failureCount < job.retryLimit;
    job.failureCount += 1;
    job.state = willRetry ? 'queued' : 'failed';
    job.claimedAt = null;
    return true;
  }

  /** The job stored under `id`, or `undefined` if there is none. */
  get(id: string): Job<TPayload, TResult> | undefined {
    const job = this.jobs.get(id);
    return job === undefined ? undefined : toJobView(job);
  }

  /** All jobs currently in the queue, newest submitted first. */
  list(): Job<TPayload, TResult>[] {
    return [...this.jobs.values()].sort((a, b) => b.seq - a.seq).map(toJobView);
  }

  /** How many jobs are currently in each state. */
  counts(): JobCounts {
    const counts: JobCounts = { queued: 0, running: 0, done: 0, failed: 0 };
    for (const job of this.jobs.values()) {
      counts[job.state] += 1;
    }
    return counts;
  }

  /**
   * Returns any `running` job to `queued` if it has been claimed for longer
   * than `claimTimeoutMs`, and returns the ids of the jobs it reaped.
   *
   * Abandonment counts as a failure toward the job's retry limit, the same
   * as an explicit `fail()` call, so a job that is repeatedly abandoned is
   * eventually left `failed` instead of being reaped forever.
   *
   * This is housekeeping the caller drives explicitly (for example, on a
   * timer) rather than something the queue does on its own.
   */
  reapAbandoned(now: Date = new Date()): string[] {
    const reaped: string[] = [];

    for (const job of this.jobs.values()) {
      if (job.state !== 'running' || job.claimedAt === null) {
        continue;
      }
      const heldFor = now.getTime() - job.claimedAt.getTime();
      if (heldFor > this.claimTimeoutMs) {
        const willRetry = job.failureCount < job.retryLimit;
        job.failureCount += 1;
        job.state = willRetry ? 'queued' : 'failed';
        job.claimedAt = null;
        reaped.push(job.id);
      }
    }

    return reaped;
  }

  /**
   * Removes every job in `done` or `failed`, leaving `queued` and `running`
   * jobs untouched. Returns the number of jobs removed.
   */
  purge(): number {
    let removed = 0;
    for (const [id, job] of this.jobs) {
      if (job.state === 'done' || job.state === 'failed') {
        this.jobs.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

function toJobView<TPayload, TResult>(job: InternalJob<TPayload, TResult>): Job<TPayload, TResult> {
  return {
    id: job.id,
    payload: job.payload,
    priority: job.priority,
    retryLimit: job.retryLimit,
    state: job.state,
    failureCount: job.failureCount,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    claimedAt: job.claimedAt,
  };
}
