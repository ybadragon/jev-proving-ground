/**
 * A job on a recurring schedule.
 *
 * This module only decides whether a job is due to run right now; it does not
 * run anything itself, and it does not mutate the jobs it is given.
 */
export interface ScheduledJob {
  /** Unique identifier for the job. */
  readonly id: string;
  /** Minimum time, in milliseconds, that must pass between runs. */
  readonly intervalMs: number;
  /** Whether the job is allowed to run at all. A disabled job is never due. */
  readonly enabled: boolean;
  /** When the job last finished running, or `null` if it has never run. */
  readonly lastRunAt: Date | null;
  /** Whether the job is currently running. A running job is never due. */
  readonly isRunning: boolean;
}

/**
 * How long, in milliseconds, a job has been waiting to run again as of `now`.
 *
 * A job that has never run is treated as having waited forever, so it always
 * outranks a job that has a recorded last run.
 */
function waitTimeMs(job: ScheduledJob, now: Date): number {
  if (job.lastRunAt === null) {
    return Infinity;
  }
  return now.getTime() - job.lastRunAt.getTime();
}

/**
 * Whether `job` should run right now.
 *
 * - A disabled job is never due.
 * - A job that is currently running is never due, however overdue it is —
 *   overlapping runs are not acceptable.
 * - A job that has never run is due immediately.
 * - Otherwise a job is due once at least `intervalMs` has passed since it
 *   last ran.
 */
export function isDue(job: ScheduledJob, now: Date = new Date()): boolean {
  if (!job.enabled || job.isRunning) {
    return false;
  }
  return waitTimeMs(job, now) >= job.intervalMs;
}

/**
 * Which of `jobs` are due to run right now, ordered so the job that has been
 * waiting longest since its last run comes first.
 */
export function getDueJobs(
  jobs: readonly ScheduledJob[],
  now: Date = new Date()
): ScheduledJob[] {
  return jobs.filter((job) => isDue(job, now)).sort((a, b) => compareByWaitTimeDesc(a, b, now));
}

/**
 * Orders `a` before `b` when `a` has been waiting longer than `b`.
 *
 * Written to avoid `Infinity - Infinity` (`NaN`), which a naive subtraction
 * of two never-run jobs' wait times would produce.
 */
function compareByWaitTimeDesc(a: ScheduledJob, b: ScheduledJob, now: Date): number {
  const waitA = waitTimeMs(a, now);
  const waitB = waitTimeMs(b, now);
  if (waitA === waitB) {
    return 0;
  }
  if (waitA === Infinity) {
    return -1;
  }
  if (waitB === Infinity) {
    return 1;
  }
  return waitB - waitA;
}
